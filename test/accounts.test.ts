import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	AccountManager,
	parseMultiAccountRefresh,
	formatMultiAccountRefresh,
} from "../lib/accounts/manager.js";
import type { OAuthAuthDetails, AccountStorage } from "../lib/types.js";

describe("AccountManager", () => {
	const createAuth = (refresh: string): OAuthAuthDetails => ({
		type: "oauth",
		refresh,
		access: "access_token_123",
		expires: Date.now() + 3600000,
	});

	describe("parseMultiAccountRefresh", () => {
		it("parses single account", () => {
			const result = parseMultiAccountRefresh("refresh1|account1");
			expect(result).toHaveLength(1);
			expect(result[0].refreshToken).toBe("refresh1");
			expect(result[0].chatgptAccountId).toBe("account1");
		});

		it("parses multiple accounts", () => {
			const result = parseMultiAccountRefresh(
				"refresh1|account1||refresh2|account2||refresh3|account3",
			);
			expect(result).toHaveLength(3);
			expect(result[0].refreshToken).toBe("refresh1");
			expect(result[1].refreshToken).toBe("refresh2");
			expect(result[2].refreshToken).toBe("refresh3");
		});

		it("handles empty string", () => {
			const result = parseMultiAccountRefresh("");
			expect(result).toHaveLength(0);
		});

		it("handles malformed input", () => {
			const result = parseMultiAccountRefresh("justrefresh");
			expect(result).toHaveLength(1);
			expect(result[0].refreshToken).toBe("justrefresh");
			expect(result[0].chatgptAccountId).toBe("");
		});
	});

	describe("formatMultiAccountRefresh", () => {
		it("formats single account", () => {
			const accounts = [
				{ index: 0, refreshToken: "refresh1", chatgptAccountId: "account1", lastUsed: 0 },
			];
			const result = formatMultiAccountRefresh(accounts);
			expect(result).toBe("refresh1|account1");
		});

		it("formats multiple accounts", () => {
			const accounts = [
				{ index: 0, refreshToken: "refresh1", chatgptAccountId: "account1", lastUsed: 0 },
				{ index: 1, refreshToken: "refresh2", chatgptAccountId: "account2", lastUsed: 0 },
			];
			const result = formatMultiAccountRefresh(accounts);
			expect(result).toBe("refresh1|account1||refresh2|account2");
		});
	});

	describe("constructor", () => {
		it("initializes from multi-account refresh string", () => {
			const auth = createAuth("refresh1|account1||refresh2|account2");
			const manager = new AccountManager(auth, null);

			expect(manager.getAccountCount()).toBe(2);
			const accounts = manager.getAccounts();
			expect(accounts[0].refreshToken).toBe("refresh1");
			expect(accounts[1].refreshToken).toBe("refresh2");
		});

		it("initializes from stored accounts", () => {
			const auth = createAuth("refresh1|account1");
			const stored: AccountStorage = {
				version: 1,
				accounts: [
					{
						refreshToken: "stored_refresh1",
						chatgptAccountId: "stored_account1",
						addedAt: Date.now(),
						lastUsed: Date.now(),
					},
					{
						refreshToken: "stored_refresh2",
						chatgptAccountId: "stored_account2",
						addedAt: Date.now(),
						lastUsed: 0,
					},
				],
				activeIndex: 0,
			};
			const manager = new AccountManager(auth, stored);

			expect(manager.getAccountCount()).toBe(2);
			const accounts = manager.getAccounts();
			expect(accounts[0].refreshToken).toBe("stored_refresh1");
			expect(accounts[1].refreshToken).toBe("stored_refresh2");
		});

		it("initializes single account from simple refresh", () => {
			const auth = createAuth("simple_refresh|simple_account");
			const manager = new AccountManager(auth, null);

			expect(manager.getAccountCount()).toBe(1);
			expect(manager.getAccounts()[0].refreshToken).toBe("simple_refresh");
		});
	});

	describe("getCurrentOrNext", () => {
		it("returns current account if not rate limited", () => {
			const auth = createAuth("refresh1|account1||refresh2|account2");
			const manager = new AccountManager(auth, null);

			const account = manager.getCurrentOrNext();
			expect(account).not.toBeNull();
			expect(account!.index).toBe(0);
		});

		it("skips rate limited account", () => {
			const auth = createAuth("refresh1|account1||refresh2|account2");
			const manager = new AccountManager(auth, null);

			const first = manager.getCurrentAccount()!;
			manager.markRateLimited(first, 60000);

			const next = manager.getCurrentOrNext();
			expect(next).not.toBeNull();
			expect(next!.index).toBe(1);
		});

		it("returns null when all accounts are rate limited", () => {
			const auth = createAuth("refresh1|account1||refresh2|account2");
			const manager = new AccountManager(auth, null);

			const accounts = manager.getAccounts();
			accounts.forEach((acc) => manager.markRateLimited(acc, 60000));

			const next = manager.getCurrentOrNext();
			expect(next).toBeNull();
		});
	});

	describe("markRateLimited", () => {
		it("sets rate limit reset time", () => {
			const auth = createAuth("refresh1|account1");
			const manager = new AccountManager(auth, null);

			const account = manager.getCurrentAccount()!;
			const before = Date.now();
			manager.markRateLimited(account, 30000);

			expect(account.rateLimitResetTime).toBeGreaterThanOrEqual(before + 30000);
		});
	});

	describe("getMinWaitTime", () => {
		it("returns 0 when account available", () => {
			const auth = createAuth("refresh1|account1||refresh2|account2");
			const manager = new AccountManager(auth, null);

			expect(manager.getMinWaitTime()).toBe(0);
		});

		it("returns minimum wait time when all rate limited", () => {
			const auth = createAuth("refresh1|account1||refresh2|account2");
			const manager = new AccountManager(auth, null);

			const accounts = manager.getAccounts();
			manager.markRateLimited(accounts[0], 60000);
			manager.markRateLimited(accounts[1], 30000);

			const waitTime = manager.getMinWaitTime();
			expect(waitTime).toBeGreaterThan(0);
			expect(waitTime).toBeLessThanOrEqual(30000);
		});
	});

	describe("addAccount", () => {
		it("adds new account", () => {
			const auth = createAuth("refresh1|account1");
			const manager = new AccountManager(auth, null);

			expect(manager.getAccountCount()).toBe(1);

			manager.addAccount("refresh2", "account2", "access2", Date.now() + 3600000);

			expect(manager.getAccountCount()).toBe(2);
			const accounts = manager.getAccounts();
			expect(accounts[1].refreshToken).toBe("refresh2");
		});
	});

	describe("removeAccount", () => {
		it("removes account by index", () => {
			const auth = createAuth("refresh1|account1||refresh2|account2");
			const manager = new AccountManager(auth, null);

			expect(manager.getAccountCount()).toBe(2);

			const result = manager.removeAccount(0);
			expect(result).toBe(true);
			expect(manager.getAccountCount()).toBe(1);
			expect(manager.getAccounts()[0].refreshToken).toBe("refresh2");
		});

		it("returns false for invalid index", () => {
			const auth = createAuth("refresh1|account1");
			const manager = new AccountManager(auth, null);

			expect(manager.removeAccount(-1)).toBe(false);
			expect(manager.removeAccount(5)).toBe(false);
		});
	});

	describe("toAuthDetails", () => {
		it("returns combined auth details", () => {
			const auth = createAuth("refresh1|account1||refresh2|account2");
			const manager = new AccountManager(auth, null);

			const details = manager.toAuthDetails();
			expect(details.type).toBe("oauth");
			expect(details.refresh).toContain("refresh1");
			expect(details.refresh).toContain("refresh2");
		});
	});

	describe("accountToAuth", () => {
		it("converts single account to auth details", () => {
			const auth = createAuth("refresh1|account1");
			const manager = new AccountManager(auth, null);

			const account = manager.getCurrentAccount()!;
			const details = manager.accountToAuth(account);

			expect(details.type).toBe("oauth");
			expect(details.refresh).toBe("refresh1|account1");
		});
	});
});
