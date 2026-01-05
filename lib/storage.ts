import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "./logger.js";

const log = createLogger("storage");

export type CooldownReason = "auth-failure" | "network-error";

export interface AccountMetadataV1 {
  accountId?: string;
  refreshToken: string;
  addedAt: number;
  lastUsed: number;
  lastSwitchReason?: "rate-limit" | "initial" | "rotation";
  rateLimitResetTime?: number;
  coolingDownUntil?: number;
  cooldownReason?: CooldownReason;
}

export interface AccountStorageV1 {
  version: 1;
  accounts: AccountMetadataV1[];
  activeIndex: number;
}

type AnyAccountStorage = AccountStorageV1;

function getConfigDir(): string {
  return join(homedir(), ".opencode");
}

export function getStoragePath(): string {
  return join(getConfigDir(), "openai-codex-accounts.json");
}

function selectNewestAccount(
  current: AccountMetadataV1 | undefined,
  candidate: AccountMetadataV1,
): AccountMetadataV1 {
  if (!current) return candidate;
  const currentLastUsed = current.lastUsed || 0;
  const candidateLastUsed = candidate.lastUsed || 0;
  if (candidateLastUsed > currentLastUsed) return candidate;
  if (candidateLastUsed < currentLastUsed) return current;
  const currentAddedAt = current.addedAt || 0;
  const candidateAddedAt = candidate.addedAt || 0;
  return candidateAddedAt >= currentAddedAt ? candidate : current;
}

export function deduplicateAccounts(
  accounts: AccountMetadataV1[],
): AccountMetadataV1[] {
  const keyToIndex = new Map<string, number>();
  const indicesToKeep = new Set<number>();

  for (let i = 0; i < accounts.length; i += 1) {
    const account = accounts[i];
    if (!account) continue;
    const key = account.accountId || account.refreshToken;
    if (!key) continue;

    const existingIndex = keyToIndex.get(key);
    if (existingIndex === undefined) {
      keyToIndex.set(key, i);
      continue;
    }

    const existing = accounts[existingIndex];
    const newest = selectNewestAccount(existing, account);
    keyToIndex.set(key, newest === account ? i : existingIndex);
  }

  for (const idx of keyToIndex.values()) {
    indicesToKeep.add(idx);
  }

  const result: AccountMetadataV1[] = [];
  for (let i = 0; i < accounts.length; i += 1) {
    if (indicesToKeep.has(i)) {
      const account = accounts[i];
      if (account) result.push(account);
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function toAccountKey(
  account: Pick<AccountMetadataV1, "accountId" | "refreshToken">,
): string {
  return account.accountId || account.refreshToken;
}

function extractActiveKey(accounts: unknown[], activeIndex: number): string | undefined {
  const candidate = accounts[activeIndex];
  if (!isRecord(candidate)) return undefined;

  const accountId =
    typeof candidate.accountId === "string" && candidate.accountId.trim()
      ? candidate.accountId
      : undefined;
  const refreshToken =
    typeof candidate.refreshToken === "string" && candidate.refreshToken.trim()
      ? candidate.refreshToken
      : undefined;

  return accountId || refreshToken;
}

export function normalizeAccountStorage(data: unknown): AccountStorageV1 | null {
  if (!isRecord(data)) {
    log.warn("Invalid storage format, ignoring");
    return null;
  }

  if (data.version !== 1) {
    log.warn("Unknown storage version, ignoring", {
      version: (data as { version?: unknown }).version,
    });
    return null;
  }

  const rawAccounts = data.accounts;
  if (!Array.isArray(rawAccounts)) {
    log.warn("Invalid storage format, ignoring");
    return null;
  }

  const activeIndexValue =
    typeof data.activeIndex === "number" && Number.isFinite(data.activeIndex)
      ? data.activeIndex
      : 0;

  const rawActiveIndex = clampIndex(activeIndexValue, rawAccounts.length);
  const activeKey = extractActiveKey(rawAccounts, rawActiveIndex);

  const validAccounts = rawAccounts.filter(
    (account): account is AccountMetadataV1 =>
      isRecord(account) && typeof account.refreshToken === "string",
  );

  const deduplicatedAccounts = deduplicateAccounts(validAccounts);

  const activeIndex = (() => {
    if (deduplicatedAccounts.length === 0) return 0;

    if (activeKey) {
      const mappedIndex = deduplicatedAccounts.findIndex(
        (account) => toAccountKey(account) === activeKey,
      );
      if (mappedIndex >= 0) return mappedIndex;
    }

    return clampIndex(rawActiveIndex, deduplicatedAccounts.length);
  })();

  return {
    version: 1,
    accounts: deduplicatedAccounts,
    activeIndex,
  };
}

export async function loadAccounts(): Promise<AccountStorageV1 | null> {
  try {
    const path = getStoragePath();
    const content = await fs.readFile(path, "utf-8");
    const data = JSON.parse(content) as unknown;

    return normalizeAccountStorage(data);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    log.error("Failed to load account storage", { error: String(error) });
    return null;
  }
}

export async function saveAccounts(storage: AccountStorageV1): Promise<void> {
  const path = getStoragePath();
  await fs.mkdir(dirname(path), { recursive: true });
  const content = JSON.stringify(storage, null, 2);
  await fs.writeFile(path, content, "utf-8");
}

export async function clearAccounts(): Promise<void> {
  try {
    const path = getStoragePath();
    await fs.unlink(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      log.error("Failed to clear account storage", { error: String(error) });
    }
  }
}
