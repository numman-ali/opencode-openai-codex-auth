import type {
	ManagedAccount,
	AccountStorage,
	OAuthAuthDetails,
} from "../types.js";
import { saveAccounts } from "./storage.js";
import { logDebug } from "../logger.js";

const ACCOUNT_SEPARATOR = "||";
const FIELD_SEPARATOR = "|";

function isRateLimited(account: ManagedAccount): boolean {
	return (
		account.rateLimitResetTime !== undefined &&
		Date.now() < account.rateLimitResetTime
	);
}

function clearExpiredRateLimit(account: ManagedAccount): void {
	if (
		account.rateLimitResetTime !== undefined &&
		Date.now() >= account.rateLimitResetTime
	) {
		account.rateLimitResetTime = undefined;
	}
}

export function parseMultiAccountRefresh(refresh: string): ManagedAccount[] {
	if (!refresh) {
		return [];
	}

	const accountStrings = refresh.split(ACCOUNT_SEPARATOR).filter((s) => s.trim());

	if (accountStrings.length === 0) {
		return [];
	}

	return accountStrings.map((str, index) => {
		const [refreshToken = "", chatgptAccountId = ""] = str.split(FIELD_SEPARATOR);
		return {
			index,
			refreshToken,
			chatgptAccountId,
			lastUsed: 0,
		};
	});
}

export function formatMultiAccountRefresh(accounts: ManagedAccount[]): string {
	return accounts
		.map((acc) => `${acc.refreshToken}${FIELD_SEPARATOR}${acc.chatgptAccountId}`)
		.filter((s) => s.trim())
		.join(ACCOUNT_SEPARATOR);
}

export class AccountManager {
	private accounts: ManagedAccount[] = [];
	private currentIndex = 0;
	private currentAccountIndex = -1;

	constructor(auth: OAuthAuthDetails, storedAccounts?: AccountStorage | null) {
		if (storedAccounts && storedAccounts.accounts.length > 0) {
			const activeIndex =
				typeof storedAccounts.activeIndex === "number" &&
				storedAccounts.activeIndex >= 0 &&
				storedAccounts.activeIndex < storedAccounts.accounts.length
					? storedAccounts.activeIndex
					: 0;

			this.currentAccountIndex = activeIndex;
			this.currentIndex = activeIndex;

			this.accounts = storedAccounts.accounts.map((acc, index) => ({
				index,
				refreshToken: acc.refreshToken,
				chatgptAccountId: acc.chatgptAccountId,
				accessToken: index === activeIndex ? auth.access : undefined,
				expiresAt: index === activeIndex ? auth.expires : undefined,
				rateLimitResetTime: acc.rateLimitResetTime,
				lastUsed: acc.lastUsed,
				email: acc.email,
				lastSwitchReason: acc.lastSwitchReason,
			}));

			logDebug(`AccountManager initialized from storage with ${this.accounts.length} accounts, active: ${activeIndex}`);
		} else {
			const parsedAccounts = parseMultiAccountRefresh(auth.refresh);

			this.currentAccountIndex = 0;
			this.currentIndex = 0;

			if (parsedAccounts.length > 0) {
				this.accounts = parsedAccounts.map((acc, index) => ({
					...acc,
					index,
					accessToken: index === 0 ? auth.access : undefined,
					expiresAt: index === 0 ? auth.expires : undefined,
				}));
				logDebug(`AccountManager initialized from refresh string with ${this.accounts.length} accounts`);
			} else {
				const [refreshToken = "", chatgptAccountId = ""] = auth.refresh.split(FIELD_SEPARATOR);
				this.accounts.push({
					index: 0,
					refreshToken,
					chatgptAccountId,
					accessToken: auth.access,
					expiresAt: auth.expires,
					lastUsed: 0,
				});
				logDebug("AccountManager initialized with single account");
			}
		}
	}

	async save(): Promise<void> {
		const storage: AccountStorage = {
			version: 1,
			accounts: this.accounts.map((acc) => ({
				refreshToken: acc.refreshToken,
				chatgptAccountId: acc.chatgptAccountId,
				email: acc.email,
				addedAt: acc.lastUsed || Date.now(),
				lastUsed: acc.lastUsed,
				lastSwitchReason: acc.lastSwitchReason,
				rateLimitResetTime: acc.rateLimitResetTime,
			})),
			activeIndex: Math.max(0, this.currentAccountIndex),
		};

		await saveAccounts(storage);
	}

	getCurrentAccount(): ManagedAccount | null {
		if (
			this.currentAccountIndex >= 0 &&
			this.currentAccountIndex < this.accounts.length
		) {
			return this.accounts[this.currentAccountIndex] ?? null;
		}
		return null;
	}

	markSwitched(
		account: ManagedAccount,
		reason: "rate-limit" | "initial" | "rotation",
	): void {
		account.lastSwitchReason = reason;
		this.currentAccountIndex = account.index;
	}

	getAccountCount(): number {
		return this.accounts.length;
	}

	getCurrentOrNext(): ManagedAccount | null {
		this.accounts.forEach(clearExpiredRateLimit);

		const current = this.getCurrentAccount();
		if (current && !isRateLimited(current)) {
			current.lastUsed = Date.now();
			logDebug(`Using current account ${current.index}/${this.accounts.length}`);
			return current;
		}

		const next = this.getNext();
		if (next) {
			this.currentAccountIndex = next.index;
			logDebug(`Rotated to account ${next.index}/${this.accounts.length}`);
		} else {
			logDebug("No available accounts (all rate limited)");
		}
		return next;
	}

	getNext(): ManagedAccount | null {
		const available = this.accounts.filter((a) => !isRateLimited(a));

		if (available.length === 0) {
			return null;
		}

		const account = available[this.currentIndex % available.length];
		if (!account) {
			return null;
		}

		this.currentIndex++;
		account.lastUsed = Date.now();
		return account;
	}

	markRateLimited(account: ManagedAccount, retryAfterMs: number): void {
		account.rateLimitResetTime = Date.now() + retryAfterMs;
		logDebug(`Account ${account.index} rate limited, reset in ${Math.ceil(retryAfterMs / 1000)}s`);
	}

	updateAccount(
		account: ManagedAccount,
		accessToken: string,
		expiresAt: number,
		refreshToken?: string,
	): void {
		account.accessToken = accessToken;
		account.expiresAt = expiresAt;
		if (refreshToken) {
			account.refreshToken = refreshToken;
		}
		logDebug(`Account ${account.index} tokens refreshed, expires in ${Math.ceil((expiresAt - Date.now()) / 1000)}s`);
	}

	toAuthDetails(): OAuthAuthDetails {
		const current = this.getCurrentAccount() || this.accounts[0];
		if (!current) {
			throw new Error("No accounts available");
		}

		return {
			type: "oauth",
			refresh: formatMultiAccountRefresh(this.accounts),
			access: current.accessToken || "",
			expires: current.expiresAt || 0,
		};
	}

	addAccount(
		refreshToken: string,
		chatgptAccountId: string,
		accessToken?: string,
		expiresAt?: number,
		email?: string,
	): void {
		this.accounts.push({
			index: this.accounts.length,
			refreshToken,
			chatgptAccountId,
			accessToken,
			expiresAt,
			lastUsed: 0,
			email,
		});
	}

	removeAccount(index: number): boolean {
		if (index < 0 || index >= this.accounts.length) {
			return false;
		}
		this.accounts.splice(index, 1);
		this.accounts.forEach((acc, idx) => (acc.index = idx));
		return true;
	}

	getAccounts(): ManagedAccount[] {
		return [...this.accounts];
	}

	accountToAuth(account: ManagedAccount): OAuthAuthDetails {
		return {
			type: "oauth",
			refresh: `${account.refreshToken}${FIELD_SEPARATOR}${account.chatgptAccountId}`,
			access: account.accessToken ?? "",
			expires: account.expiresAt ?? 0,
		};
	}

	getMinWaitTime(): number {
		const available = this.accounts.filter((a) => {
			clearExpiredRateLimit(a);
			return !isRateLimited(a);
		});

		if (available.length > 0) {
			return 0;
		}

		const waitTimes = this.accounts
			.map((a) => a.rateLimitResetTime)
			.filter((t): t is number => t !== undefined)
			.map((t) => Math.max(0, t - Date.now()));

		return waitTimes.length > 0 ? Math.min(...waitTimes) : 0;
	}
}
