import type { Auth } from "@opencode-ai/sdk";
import { decodeJWT } from "./auth/auth.js";
import { JWT_CLAIM_PATH } from "./constants.js";
import {
  loadAccounts,
  saveAccounts,
  type AccountStorageV1,
  type AccountMetadataV1,
  type CooldownReason,
} from "./storage.js";
import type { OAuthAuthDetails } from "./types.js";

export interface ManagedAccount {
  index: number;
  accountId?: string;
  refreshToken: string;
  access?: string;
  expires?: number;
  addedAt: number;
  lastUsed: number;
  lastSwitchReason?: "rate-limit" | "initial" | "rotation";
  rateLimitResetTime?: number;
  coolingDownUntil?: number;
  cooldownReason?: CooldownReason;
}

function nowMs(): number {
  return Date.now();
}

function clampNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value < 0 ? 0 : Math.floor(value);
}

export function extractAccountId(accessToken?: string): string | undefined {
  if (!accessToken) return undefined;
  const decoded = decodeJWT(accessToken);
  const accountId = decoded?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
  return typeof accountId === "string" && accountId.trim() ? accountId : undefined;
}

function isRateLimited(account: ManagedAccount): boolean {
  if (typeof account.rateLimitResetTime !== "number") return false;
  return nowMs() < account.rateLimitResetTime;
}

function clearExpiredRateLimit(account: ManagedAccount): void {
  if (typeof account.rateLimitResetTime !== "number") return;
  if (nowMs() >= account.rateLimitResetTime) {
    delete account.rateLimitResetTime;
  }
}

export class AccountManager {
  private accounts: ManagedAccount[] = [];
  private cursor = 0;
  private activeIndex = -1;
  private lastToastAccountIndex = -1;
  private lastToastTime = 0;

  static async loadFromDisk(
    authFallback?: OAuthAuthDetails,
  ): Promise<AccountManager> {
    const stored = await loadAccounts();
    return new AccountManager(authFallback, stored);
  }

  constructor(authFallback?: OAuthAuthDetails, stored?: AccountStorageV1 | null) {
    const fallbackAccountId = extractAccountId(authFallback?.access);

    if (stored && stored.accounts.length > 0) {
      const baseNow = nowMs();
      this.accounts = stored.accounts
        .map((account, index): ManagedAccount | null => {
          if (!account.refreshToken || typeof account.refreshToken !== "string") {
            return null;
          }
          const matchesFallback =
            !!authFallback &&
            ((fallbackAccountId && account.accountId === fallbackAccountId) ||
              account.refreshToken === authFallback.refresh);

          const refreshToken = matchesFallback
            ? authFallback.refresh
            : account.refreshToken;

          return {
            index,
            accountId: matchesFallback ? fallbackAccountId ?? account.accountId : account.accountId,
            refreshToken,
            access: matchesFallback ? authFallback.access : undefined,
            expires: matchesFallback ? authFallback.expires : undefined,
            addedAt: clampNonNegativeInt(account.addedAt, baseNow),
            lastUsed: clampNonNegativeInt(account.lastUsed, 0),
            lastSwitchReason: account.lastSwitchReason,
            rateLimitResetTime: account.rateLimitResetTime,
            coolingDownUntil: account.coolingDownUntil,
            cooldownReason: account.cooldownReason,
          };
        })
        .filter((account): account is ManagedAccount => account !== null);

      const hasMatchingFallback =
        !!authFallback &&
        this.accounts.some(
          (account) =>
            account.refreshToken === authFallback.refresh ||
            (fallbackAccountId && account.accountId === fallbackAccountId),
        );

      if (authFallback && !hasMatchingFallback) {
        const now = nowMs();
        this.accounts.push({
          index: this.accounts.length,
          accountId: fallbackAccountId,
          refreshToken: authFallback.refresh,
          access: authFallback.access,
          expires: authFallback.expires,
          addedAt: now,
          lastUsed: now,
          lastSwitchReason: "initial",
        });
      }

      if (this.accounts.length > 0) {
        const nextIndex = clampNonNegativeInt(stored.activeIndex, 0);
        this.activeIndex = nextIndex % this.accounts.length;
        this.cursor = this.activeIndex;
      }
      return;
    }

    if (authFallback) {
      const now = nowMs();
      this.accounts = [
        {
          index: 0,
          accountId: fallbackAccountId,
          refreshToken: authFallback.refresh,
          access: authFallback.access,
          expires: authFallback.expires,
          addedAt: now,
          lastUsed: 0,
          lastSwitchReason: "initial",
        },
      ];
      this.activeIndex = 0;
      this.cursor = 0;
    }
  }

  getAccountCount(): number {
    return this.accounts.length;
  }

  getActiveIndex(): number {
    return this.activeIndex;
  }

  getAccountsSnapshot(): ManagedAccount[] {
    return this.accounts.map((account) => ({ ...account }));
  }

  setActiveIndex(index: number): ManagedAccount | null {
    if (!Number.isFinite(index)) return null;
    if (index < 0 || index >= this.accounts.length) return null;
    const account = this.accounts[index];
    if (!account) return null;
    this.activeIndex = index;
    account.lastUsed = nowMs();
    account.lastSwitchReason = "rotation";
    return account;
  }

  getCurrentAccount(): ManagedAccount | null {
    if (this.activeIndex < 0 || this.activeIndex >= this.accounts.length) {
      return null;
    }
    return this.accounts[this.activeIndex] ?? null;
  }

  getCurrentOrNext(): ManagedAccount | null {
    const current = this.getCurrentAccount();
    if (current) {
      clearExpiredRateLimit(current);
      if (!isRateLimited(current) && !this.isAccountCoolingDown(current)) {
        current.lastUsed = nowMs();
        return current;
      }
    }

    const next = this.getNextAvailable();
    if (next) {
      this.activeIndex = next.index;
    }
    return next;
  }

  getNextAvailable(): ManagedAccount | null {
    const available = this.accounts.filter((account) => {
      clearExpiredRateLimit(account);
      return !isRateLimited(account) && !this.isAccountCoolingDown(account);
    });
    if (available.length === 0) {
      return null;
    }
    const account = available[this.cursor % available.length];
    if (!account) return null;
    this.cursor += 1;
    account.lastUsed = nowMs();
    return account;
  }

  markSwitched(
    account: ManagedAccount,
    reason: "rate-limit" | "initial" | "rotation",
  ): void {
    account.lastSwitchReason = reason;
    this.activeIndex = account.index;
  }

  markRateLimited(account: ManagedAccount, retryAfterMs: number): void {
    const retryMs = Math.max(0, Math.floor(retryAfterMs));
    account.rateLimitResetTime = nowMs() + retryMs;
  }

  markAccountCoolingDown(
    account: ManagedAccount,
    cooldownMs: number,
    reason: CooldownReason,
  ): void {
    const ms = Math.max(0, Math.floor(cooldownMs));
    account.coolingDownUntil = nowMs() + ms;
    account.cooldownReason = reason;
  }

  isAccountCoolingDown(account: ManagedAccount): boolean {
    if (account.coolingDownUntil === undefined) return false;
    if (nowMs() >= account.coolingDownUntil) {
      this.clearAccountCooldown(account);
      return false;
    }
    return true;
  }

  clearAccountCooldown(account: ManagedAccount): void {
    delete account.coolingDownUntil;
    delete account.cooldownReason;
  }

  shouldShowAccountToast(accountIndex: number, debounceMs = 30000): boolean {
    const now = nowMs();
    if (accountIndex === this.lastToastAccountIndex && now - this.lastToastTime < debounceMs) {
      return false;
    }
    return true;
  }

  markToastShown(accountIndex: number): void {
    this.lastToastAccountIndex = accountIndex;
    this.lastToastTime = nowMs();
  }

  updateFromAuth(account: ManagedAccount, auth: OAuthAuthDetails): void {
    account.refreshToken = auth.refresh;
    account.access = auth.access;
    account.expires = auth.expires;
    account.accountId = extractAccountId(auth.access) ?? account.accountId;
  }

  toAuthDetails(account: ManagedAccount): Auth {
    return {
      type: "oauth",
      access: account.access ?? "",
      refresh: account.refreshToken,
      expires: account.expires ?? 0,
    };
  }

  getMinWaitTime(): number {
    const now = nowMs();
    const available = this.accounts.filter((account) => {
      clearExpiredRateLimit(account);
      return !isRateLimited(account) && !this.isAccountCoolingDown(account);
    });
    if (available.length > 0) return 0;

    const waitTimes: number[] = [];
    for (const account of this.accounts) {
      if (typeof account.rateLimitResetTime === "number") {
        waitTimes.push(Math.max(0, account.rateLimitResetTime - now));
      }
      if (typeof account.coolingDownUntil === "number") {
        waitTimes.push(Math.max(0, account.coolingDownUntil - now));
      }
    }
    return waitTimes.length > 0 ? Math.min(...waitTimes) : 0;
  }

  async saveToDisk(): Promise<void> {
    const storage: AccountStorageV1 = {
      version: 1,
      accounts: this.accounts.map((account) => ({
        accountId: account.accountId,
        refreshToken: account.refreshToken,
        addedAt: account.addedAt,
        lastUsed: account.lastUsed,
        lastSwitchReason: account.lastSwitchReason,
        rateLimitResetTime: account.rateLimitResetTime,
        coolingDownUntil: account.coolingDownUntil,
        cooldownReason: account.cooldownReason,
      })),
      activeIndex: Math.max(0, this.activeIndex),
    };
    await saveAccounts(storage);
  }
}

export function formatAccountLabel(accountId: string | undefined, index: number): string {
  if (!accountId) return `Account ${index + 1}`;
  const suffix = accountId.length > 6 ? accountId.slice(-6) : accountId;
  return `Account ${index + 1} (${suffix})`;
}

export function formatWaitTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatCooldown(account: ManagedAccount, now = nowMs()): string | null {
  if (typeof account.coolingDownUntil !== "number") return null;
  const remaining = account.coolingDownUntil - now;
  if (remaining <= 0) return null;
  const reason = account.cooldownReason ? ` (${account.cooldownReason})` : "";
  return `${formatWaitTime(remaining)}${reason}`;
}
