#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const args = process.argv.slice(2);
const command = args[0];

async function showHelp() {
	console.log(`
opencode-openai-codex-auth - Multi-account management

Commands:
  add       Add a new account to existing accounts
  list      List all configured accounts
  remove    Remove an account by index
  help      Show this help message

Examples:
  npx opencode-openai-codex-auth add
  npx opencode-openai-codex-auth list
  npx opencode-openai-codex-auth remove 1
`);
}

async function loadModules() {
	const { loadAccounts, saveAccounts, getStoragePath } = await import("../dist/lib/accounts/storage.js");
	const {
		createAuthorizationFlow,
		exchangeAuthorizationCode,
		decodeJWT,
		REDIRECT_URI,
	} = await import("../dist/lib/auth/auth.js");
	const { startLocalOAuthServer } = await import("../dist/lib/auth/server.js");
	const { openBrowserUrl } = await import("../dist/lib/auth/browser.js");
	const { JWT_CLAIM_PATH } = await import("../dist/lib/constants.js");

	return {
		loadAccounts,
		saveAccounts,
		getStoragePath,
		createAuthorizationFlow,
		exchangeAuthorizationCode,
		decodeJWT,
		REDIRECT_URI,
		startLocalOAuthServer,
		openBrowserUrl,
		JWT_CLAIM_PATH,
	};
}

async function listAccounts() {
	const { loadAccounts, getStoragePath } = await loadModules();
	const storage = await loadAccounts();

	if (!storage || storage.accounts.length === 0) {
		console.log("No accounts configured.");
		console.log(`Storage path: ${getStoragePath()}`);
		return;
	}

	console.log(`\nConfigured accounts (${storage.accounts.length}):\n`);
	storage.accounts.forEach((acc, index) => {
		const active = index === storage.activeIndex ? " (active)" : "";
		const email = acc.email ? ` - ${acc.email}` : "";
		const rateLimited = acc.rateLimitResetTime && acc.rateLimitResetTime > Date.now()
			? ` [rate limited until ${new Date(acc.rateLimitResetTime).toLocaleTimeString()}]`
			: "";
		console.log(`  ${index}: ${acc.chatgptAccountId.slice(0, 8)}...${email}${active}${rateLimited}`);
	});
	console.log(`\nStorage: ${getStoragePath()}`);
}

async function addAccount() {
	const {
		loadAccounts,
		saveAccounts,
		createAuthorizationFlow,
		exchangeAuthorizationCode,
		decodeJWT,
		REDIRECT_URI,
		startLocalOAuthServer,
		openBrowserUrl,
		JWT_CLAIM_PATH,
	} = await loadModules();

	const storage = await loadAccounts() || {
		version: 1,
		accounts: [],
		activeIndex: 0,
	};

	console.log(`\nCurrently have ${storage.accounts.length} account(s). Adding new account...\n`);

	const { pkce, state, url } = await createAuthorizationFlow();
	const serverInfo = await startLocalOAuthServer({ state });

	openBrowserUrl(url);

	let tokens;
	if (!serverInfo.ready) {
		serverInfo.close();
		console.log(`Open this URL in your browser:\n${url}\n`);
		const rl = createInterface({ input: stdin, output: stdout });
		try {
			const input = await rl.question("Paste the full redirect URL here: ");
			const urlObj = new URL(input);
			const code = urlObj.searchParams.get("code");
			if (!code) {
				console.error("No authorization code found in URL");
				process.exit(1);
			}
			tokens = await exchangeAuthorizationCode(code, pkce.verifier, REDIRECT_URI);
		} finally {
			rl.close();
		}
	} else {
		console.log("Waiting for browser authentication...");
		const result = await serverInfo.waitForCode(state);
		serverInfo.close();

		if (!result) {
			console.error("Authentication failed or timed out");
			process.exit(1);
		}

		tokens = await exchangeAuthorizationCode(result.code, pkce.verifier, REDIRECT_URI);
	}

	if (tokens?.type !== "success") {
		console.error("Token exchange failed");
		process.exit(1);
	}

	const decoded = decodeJWT(tokens.access);
	const chatgptAccountId = decoded?.[JWT_CLAIM_PATH]?.chatgpt_account_id;

	if (!chatgptAccountId) {
		console.error("Could not extract ChatGPT account ID from token");
		process.exit(1);
	}

	const existing = storage.accounts.find(a => a.chatgptAccountId === chatgptAccountId);
	if (existing) {
		console.log(`\nAccount ${chatgptAccountId.slice(0, 8)}... already exists. Updating tokens.`);
		existing.refreshToken = tokens.refresh;
		existing.lastUsed = Date.now();
	} else {
		storage.accounts.push({
			refreshToken: tokens.refresh,
			chatgptAccountId,
			addedAt: Date.now(),
			lastUsed: 0,
		});
		console.log(`\nAdded account ${chatgptAccountId.slice(0, 8)}...`);
	}

	await saveAccounts(storage);
	console.log(`Total accounts: ${storage.accounts.length}`);
	console.log("\nNote: You may need to re-run 'opencode auth login' to update the combined refresh token.");
}

async function removeAccount() {
	const indexArg = args[1];
	if (indexArg === undefined) {
		console.error("Usage: opencode-openai-codex-auth remove <index>");
		console.error("Run 'opencode-openai-codex-auth list' to see account indices.");
		process.exit(1);
	}

	const index = parseInt(indexArg, 10);
	if (isNaN(index)) {
		console.error(`Invalid index: ${indexArg}`);
		process.exit(1);
	}

	const { loadAccounts, saveAccounts } = await loadModules();
	const storage = await loadAccounts();

	if (!storage || storage.accounts.length === 0) {
		console.error("No accounts configured.");
		process.exit(1);
	}

	if (index < 0 || index >= storage.accounts.length) {
		console.error(`Index ${index} out of range. Valid: 0-${storage.accounts.length - 1}`);
		process.exit(1);
	}

	const removed = storage.accounts.splice(index, 1)[0];
	if (storage.activeIndex >= storage.accounts.length) {
		storage.activeIndex = Math.max(0, storage.accounts.length - 1);
	}

	await saveAccounts(storage);
	console.log(`Removed account ${removed.chatgptAccountId.slice(0, 8)}...`);
	console.log(`Remaining accounts: ${storage.accounts.length}`);
}

async function main() {
	switch (command) {
		case "add":
			await addAccount();
			break;
		case "list":
			await listAccounts();
			break;
		case "remove":
			await removeAccount();
			break;
		case "help":
		case "--help":
		case "-h":
		case undefined:
			await showHelp();
			break;
		default:
			console.error(`Unknown command: ${command}`);
			await showHelp();
			process.exit(1);
	}
}

main().catch((error) => {
	console.error(`Error: ${error.message}`);
	process.exit(1);
});
