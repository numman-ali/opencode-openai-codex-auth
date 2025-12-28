/**
 * Browser utilities for OAuth flow
 * Handles platform-specific browser opening
 */

import { spawn, spawnSync } from "node:child_process";
import { PLATFORM_OPENERS } from "../constants.js";

/**
 * Gets the platform-specific command to open a URL in the default browser
 * @returns Browser opener command for the current platform
 */
export function getBrowserOpener(): string {
	const platform = process.platform;
	if (platform === "darwin") return PLATFORM_OPENERS.darwin;
	if (platform === "win32") return PLATFORM_OPENERS.win32;
	return PLATFORM_OPENERS.linux;
}

/**
 * Checks if a command exists in PATH
 * @param command - Command name to check
 * @returns true if command exists, false otherwise
 */
function commandExists(command: string): boolean {
	try {
		const result = spawnSync(
			process.platform === "win32" ? "where" : "which",
			[command],
			{ stdio: "ignore" },
		);
		return result.status === 0;
	} catch {
		return false;
	}
}

/**
 * Opens a URL in the default browser
 * Silently fails if browser cannot be opened (user can copy URL manually)
 * @param url - URL to open
 */
export function openBrowserUrl(url: string): void {
	try {
		const opener = getBrowserOpener();

		// Check if the opener command exists before attempting to spawn
		// This prevents crashes in headless environments (Docker, WSL, CI, etc.)
		if (!commandExists(opener)) {
			return;
		}

		spawn(opener, [url], {
			stdio: "ignore",
			shell: process.platform === "win32",
		});
	} catch (error) {
		// Silently fail - user can manually open the URL from instructions
	}
}
