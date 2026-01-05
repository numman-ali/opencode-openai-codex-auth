import { describe, it, expect } from "vitest";
import { deduplicateAccounts, normalizeAccountStorage } from "../lib/storage.js";

describe("storage", () => {
  it("remaps activeIndex after deduplication using active account key", () => {
    const now = Date.now();

    const raw = {
      version: 1,
      activeIndex: 1,
      accounts: [
        {
          accountId: "acctA",
          refreshToken: "tokenA",
          addedAt: now - 2000,
          lastUsed: now - 2000,
        },
        {
          accountId: "acctA",
          refreshToken: "tokenA",
          addedAt: now - 1000,
          lastUsed: now - 1000,
        },
        {
          accountId: "acctB",
          refreshToken: "tokenB",
          addedAt: now,
          lastUsed: now,
        },
      ],
    };

    const normalized = normalizeAccountStorage(raw);
    expect(normalized).not.toBeNull();
    expect(normalized?.accounts).toHaveLength(2);
    expect(normalized?.accounts[0]?.accountId).toBe("acctA");
    expect(normalized?.accounts[1]?.accountId).toBe("acctB");
    expect(normalized?.activeIndex).toBe(0);
  });

  it("deduplicates accounts by keeping the most recently used record", () => {
    const now = Date.now();

    const accounts = [
      {
        accountId: "acctA",
        refreshToken: "tokenA",
        addedAt: now - 2000,
        lastUsed: now - 1000,
      },
      {
        accountId: "acctA",
        refreshToken: "tokenA",
        addedAt: now - 1500,
        lastUsed: now,
      },
    ];

    const deduped = deduplicateAccounts(accounts);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.addedAt).toBe(now - 1500);
    expect(deduped[0]?.lastUsed).toBe(now);
  });
});
