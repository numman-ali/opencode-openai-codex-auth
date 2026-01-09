/**
 * Account storage for multi-account support
 * Persists account metadata to ~/.opencode/openai-codex-accounts.json
 */

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { AccountMetadata, AccountStorage } from "../types.js";

/**
 * Get the platform-specific data directory for opencode
 */
function getDataDir(): string {
	const platform = process.platform;

	if (platform === "win32") {
		return join(
			process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
			"opencode",
		);
	}

	const xdgData =
		process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
	return join(xdgData, "opencode");
}

/**
 * Get the storage path for account metadata
 */
export function getStoragePath(): string {
	return join(getDataDir(), "openai-codex-accounts.json");
}

/**
 * Load accounts from storage
 * @returns Account storage or null if not found/invalid
 */
export async function loadAccounts(): Promise<AccountStorage | null> {
	try {
		const path = getStoragePath();
		const content = await fs.readFile(path, "utf-8");
		const data = JSON.parse(content) as AccountStorage;

		if (!Array.isArray(data.accounts)) {
			console.warn("[openai-codex-plugin] Invalid storage format, ignoring");
			return null;
		}

		if (data.version !== 1) {
			console.warn(
				"[openai-codex-plugin] Unknown storage version, ignoring",
				data.version,
			);
			return null;
		}

		// Validate activeIndex
		if (
			typeof data.activeIndex !== "number" ||
			!Number.isInteger(data.activeIndex)
		) {
			data.activeIndex = 0;
		}

		if (data.activeIndex < 0 || data.activeIndex >= data.accounts.length) {
			data.activeIndex = 0;
		}

		return data;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		console.error(
			"[openai-codex-plugin] Failed to load account storage:",
			(error as Error).message,
		);
		return null;
	}
}

/**
 * Save accounts to storage
 * @param storage - Account storage to save
 */
export async function saveAccounts(storage: AccountStorage): Promise<void> {
	try {
		const path = getStoragePath();

		await fs.mkdir(dirname(path), { recursive: true });

		const content = JSON.stringify(storage, null, 2);
		await fs.writeFile(path, content, "utf-8");
	} catch (error) {
		console.error(
			"[openai-codex-plugin] Failed to save account storage:",
			(error as Error).message,
		);
		throw error;
	}
}

/**
 * Create account storage from account data
 */
export function createAccountStorage(
	accounts: Array<{
		refreshToken: string;
		accessToken?: string;
		expiresAt?: number;
		chatgptAccountId: string;
		email?: string;
	}>,
): AccountStorage {
	const now = Date.now();

	return {
		version: 1,
		accounts: accounts.map((acc, index) => ({
			refreshToken: acc.refreshToken,
			chatgptAccountId: acc.chatgptAccountId,
			email: acc.email,
			addedAt: now,
			lastUsed: index === 0 ? now : 0,
		})),
		activeIndex: 0,
	};
}
