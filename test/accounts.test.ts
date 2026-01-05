import { describe, it, expect } from "vitest";
import { AccountManager } from "../lib/accounts.js";
import type { OAuthAuthDetails } from "../lib/types.js";

describe("AccountManager", () => {
  it("seeds from fallback auth when no storage exists", () => {
    const auth: OAuthAuthDetails = {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 60_000,
    };

    const manager = new AccountManager(auth, null);
    expect(manager.getAccountCount()).toBe(1);
    expect(manager.getCurrentAccount()?.refreshToken).toBe("refresh-token");
  });

  it("rotates when the active account is rate-limited", () => {
    const now = Date.now();
    const stored = {
      version: 1,
      activeIndex: 0,
      accounts: [
        {
          refreshToken: "token-1",
          addedAt: now,
          lastUsed: now,
          rateLimitResetTime: now + 60_000,
        },
        {
          refreshToken: "token-2",
          addedAt: now,
          lastUsed: now,
        },
      ],
    };

    const manager = new AccountManager(undefined, stored);
    const account = manager.getCurrentOrNext();
    expect(account?.refreshToken).toBe("token-2");
    expect(manager.getMinWaitTime()).toBe(0);
  });

  it("skips accounts that are cooling down", () => {
    const now = Date.now();
    const stored = {
      version: 1,
      activeIndex: 0,
      accounts: [
        {
          refreshToken: "token-1",
          addedAt: now,
          lastUsed: now,
          coolingDownUntil: now + 60_000,
          cooldownReason: "auth-failure" as const,
        },
        {
          refreshToken: "token-2",
          addedAt: now,
          lastUsed: now,
        },
      ],
    };

    const manager = new AccountManager(undefined, stored);
    const account = manager.getCurrentOrNext();
    expect(account?.refreshToken).toBe("token-2");
    expect(manager.getActiveIndex()).toBe(1);
  });

  it("returns min wait time when all accounts are blocked", () => {
    const now = Date.now();
    const stored = {
      version: 1,
      activeIndex: 0,
      accounts: [
        {
          refreshToken: "token-1",
          addedAt: now,
          lastUsed: now,
          coolingDownUntil: now + 60_000,
          cooldownReason: "network-error" as const,
        },
        {
          refreshToken: "token-2",
          addedAt: now,
          lastUsed: now,
          rateLimitResetTime: now + 120_000,
        },
      ],
    };

    const manager = new AccountManager(undefined, stored);
    const waitMs = manager.getMinWaitTime();
    expect(waitMs).toBeGreaterThan(0);
    expect(waitMs).toBeLessThanOrEqual(60_000);
  });

  it("debounces account toasts for the same account index", () => {
    const now = Date.now();
    const stored = {
      version: 1,
      activeIndex: 0,
      accounts: [
        {
          refreshToken: "token-1",
          addedAt: now,
          lastUsed: now,
        },
        {
          refreshToken: "token-2",
          addedAt: now,
          lastUsed: now,
        },
      ],
    };

    const manager = new AccountManager(undefined, stored);
    expect(manager.shouldShowAccountToast(0, 60_000)).toBe(true);
    manager.markToastShown(0);
    expect(manager.shouldShowAccountToast(0, 60_000)).toBe(false);
    expect(manager.shouldShowAccountToast(1, 60_000)).toBe(true);
  });
});
