/**
 * OpenAI ChatGPT (Codex) OAuth Authentication Plugin for opencode
 *
 * COMPLIANCE NOTICE:
 * This plugin uses OpenAI's official OAuth authentication flow (the same method
 * used by OpenAI's official Codex CLI at https://github.com/openai/codex).
 *
 * INTENDED USE: Personal development and coding assistance with your own
 * ChatGPT Plus/Pro subscription.
 *
 * NOT INTENDED FOR: Commercial resale, multi-user services, high-volume
 * automated extraction, or any use that violates OpenAI's Terms of Service.
 *
 * Users are responsible for ensuring their usage complies with:
 * - OpenAI Terms of Use: https://openai.com/policies/terms-of-use/
 * - OpenAI Usage Policies: https://openai.com/policies/usage-policies/
 *
 * For production applications, use the OpenAI Platform API: https://platform.openai.com/
 *
 * @license MIT with Usage Disclaimer (see LICENSE file)
 * @author numman-ali
 * @repository https://github.com/numman-ali/opencode-openai-codex-auth
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Auth } from "@opencode-ai/sdk";
import {
	createAuthorizationFlow,
	decodeJWT,
	exchangeAuthorizationCode,
	parseAuthorizationInput,
	REDIRECT_URI,
	isOAuthAuth,
	accessTokenExpired,
	refreshAccessToken,
} from "./lib/auth/auth.js";
import { openBrowserUrl } from "./lib/auth/browser.js";
import { startLocalOAuthServer } from "./lib/auth/server.js";
import { getCodexMode, loadPluginConfig } from "./lib/config.js";
import {
	AUTH_LABELS,
	CODEX_BASE_URL,
	DUMMY_API_KEY,
	ERROR_MESSAGES,
	JWT_CLAIM_PATH,
	LOG_STAGES,
	PLUGIN_NAME,
	PROVIDER_ID,
	MAX_ACCOUNTS,
	HTTP_STATUS,
} from "./lib/constants.js";
import { logRequest, logDebug } from "./lib/logger.js";
import {
	createCodexHeaders,
	extractRequestUrl,
	handleErrorResponse,
	handleSuccessResponse,
	rewriteUrlForCodex,
	transformRequestForCodex,
} from "./lib/request/fetch-helpers.js";
import type { UserConfig, OAuthAuthDetails, TokenSuccess } from "./lib/types.js";
import {
	AccountManager,
	formatMultiAccountRefresh,
} from "./lib/accounts/manager.js";
import { loadAccounts, saveAccounts } from "./lib/accounts/storage.js";
import { promptAddAnotherAccount } from "./lib/accounts/cli.js";

interface AuthenticatedAccount {
	refreshToken: string;
	accessToken: string;
	expiresAt: number;
	chatgptAccountId: string;
}

async function authenticateSingleAccount(): Promise<AuthenticatedAccount | null> {
	const { pkce, state, url } = await createAuthorizationFlow();
	const serverInfo = await startLocalOAuthServer({ state });

	openBrowserUrl(url);

	if (!serverInfo.ready) {
		serverInfo.close();
		console.log(`\nOpen this URL in your browser: ${url}\n`);
		const { createInterface } = await import("node:readline/promises");
		const { stdin, stdout } = await import("node:process");
		const rl = createInterface({ input: stdin, output: stdout });

		try {
			const input = await rl.question("Paste the full redirect URL here: ");
			const parsed = parseAuthorizationInput(input);
			if (!parsed.code) {
				return null;
			}
			const tokens = await exchangeAuthorizationCode(
				parsed.code,
				pkce.verifier,
				REDIRECT_URI,
			);
			if (tokens?.type !== "success") {
				return null;
			}
			const decoded = decodeJWT(tokens.access);
			const chatgptAccountId = decoded?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
			if (!chatgptAccountId) {
				return null;
			}
			return {
				refreshToken: tokens.refresh,
				accessToken: tokens.access,
				expiresAt: tokens.expires,
				chatgptAccountId,
			};
		} finally {
			rl.close();
		}
	}

	const result = await serverInfo.waitForCode(state);
	serverInfo.close();

	if (!result) {
		return null;
	}

	const tokens = await exchangeAuthorizationCode(
		result.code,
		pkce.verifier,
		REDIRECT_URI,
	);

	if (tokens?.type !== "success") {
		return null;
	}

	const decoded = decodeJWT(tokens.access);
	const chatgptAccountId = decoded?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
	if (!chatgptAccountId) {
		return null;
	}

	return {
		refreshToken: tokens.refresh,
		accessToken: tokens.access,
		expiresAt: tokens.expires,
		chatgptAccountId,
	};
}

export const OpenAIAuthPlugin: Plugin = async ({ client }: PluginInput) => {
	const buildManualOAuthFlow = (pkce: { verifier: string }, url: string) => ({
		url,
		method: "code" as const,
		instructions: AUTH_LABELS.INSTRUCTIONS_MANUAL,
		callback: async (input: string) => {
			const parsed = parseAuthorizationInput(input);
			if (!parsed.code) {
				return { type: "failed" as const };
			}
			const tokens = await exchangeAuthorizationCode(
				parsed.code,
				pkce.verifier,
				REDIRECT_URI,
			);
			return tokens?.type === "success" ? tokens : { type: "failed" as const };
		},
	});

	return {
		auth: {
			provider: PROVIDER_ID,
			async loader(getAuth: () => Promise<Auth>, provider: unknown) {
				const auth = await getAuth();

				if (!isOAuthAuth(auth)) {
					return {};
				}

				const storedAccounts = await loadAccounts();
				const accountManager = new AccountManager(auth, storedAccounts);

				const providerConfig = provider as
					| { options?: Record<string, unknown>; models?: UserConfig["models"] }
					| undefined;
				const userConfig: UserConfig = {
					global: providerConfig?.options || {},
					models: providerConfig?.models || {},
				};

				const pluginConfig = loadPluginConfig();
				const codexMode = getCodexMode(pluginConfig);

				return {
					apiKey: DUMMY_API_KEY,
					baseURL: CODEX_BASE_URL,
					async fetch(
						input: Request | string | URL,
						init?: RequestInit,
					): Promise<Response> {
						const account = accountManager.getCurrentOrNext();
						if (!account) {
							const waitTime = accountManager.getMinWaitTime();
							if (waitTime > 0) {
								logDebug(
									`[${PLUGIN_NAME}] All accounts rate limited, waiting ${Math.ceil(waitTime / 1000)}s`,
								);
							}
							throw new Error("All accounts are rate limited");
						}

						let authDetails = accountManager.accountToAuth(account);

						if (accessTokenExpired(authDetails)) {
							const refreshResult = await refreshAccessToken(account.refreshToken);
							if (refreshResult.type === "failed") {
								throw new Error(ERROR_MESSAGES.TOKEN_REFRESH_FAILED);
							}
							accountManager.updateAccount(
								account,
								refreshResult.access,
								refreshResult.expires,
								refreshResult.refresh,
							);
							authDetails = accountManager.accountToAuth(account);

							await client.auth.set({
								path: { id: PROVIDER_ID },
								body: accountManager.toAuthDetails(),
							});
							await accountManager.save();
						}

						const originalUrl = extractRequestUrl(input);
						const url = rewriteUrlForCodex(originalUrl);

						const originalBody = init?.body ? JSON.parse(init.body as string) : {};
						const isStreaming = originalBody.stream === true;

						const transformation = await transformRequestForCodex(
							init,
							url,
							userConfig,
							codexMode,
						);
						const requestInit = transformation?.updatedInit ?? init;

						const headers = createCodexHeaders(
							requestInit,
							account.chatgptAccountId,
							authDetails.access,
							{
								model: transformation?.body.model,
								promptCacheKey: (transformation?.body as any)?.prompt_cache_key,
							},
						);

						const response = await fetch(url, {
							...requestInit,
							headers,
						});

						logRequest(LOG_STAGES.RESPONSE, {
							status: response.status,
							ok: response.ok,
							statusText: response.statusText,
							headers: Object.fromEntries(response.headers.entries()),
							accountIndex: account.index,
							accountCount: accountManager.getAccountCount(),
						});

						if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
							const retryAfter = response.headers.get("retry-after");
							const retryMs = retryAfter
								? parseInt(retryAfter, 10) * 1000
								: 60 * 1000;
							accountManager.markRateLimited(account, retryMs);
							await accountManager.save();

							logDebug(
								`[${PLUGIN_NAME}] Account ${account.index} rate limited, retry after ${Math.ceil(retryMs / 1000)}s`,
							);

							const nextAccount = accountManager.getNext();
							if (nextAccount && nextAccount.index !== account.index) {
								accountManager.markSwitched(nextAccount, "rate-limit");
								logDebug(
									`[${PLUGIN_NAME}] Switching to account ${nextAccount.index}`,
								);
							}
						}

						if (!response.ok) {
							return await handleErrorResponse(response);
						}

						return await handleSuccessResponse(response, isStreaming);
					},
				};
			},
			methods: [
				{
					label: AUTH_LABELS.OAUTH,
					type: "oauth" as const,
					authorize: async () => {
						const accounts: AuthenticatedAccount[] = [];

						const firstAccount = await authenticateSingleAccount();
						if (!firstAccount) {
							return {
								url: "",
								instructions: "Authentication cancelled",
								method: "auto" as const,
								callback: async () => ({ type: "failed" as const }),
							};
						}

						accounts.push(firstAccount);
						console.log(`\nAccount 1 authenticated successfully.`);

						while (accounts.length < MAX_ACCOUNTS) {
							const addAnother = await promptAddAnotherAccount(accounts.length);
							if (!addAnother) {
								break;
							}

							const nextAccount = await authenticateSingleAccount();
							if (!nextAccount) {
								console.log("Skipping this account...");
								continue;
							}

							accounts.push(nextAccount);
							console.log(`Account ${accounts.length} authenticated successfully.`);
						}

						const refreshParts = accounts.map((acc) => ({
							index: 0,
							refreshToken: acc.refreshToken,
							chatgptAccountId: acc.chatgptAccountId,
							lastUsed: 0,
						}));
						const combinedRefresh = formatMultiAccountRefresh(refreshParts);

						try {
							await saveAccounts({
								version: 1,
								accounts: accounts.map((acc, index) => ({
									refreshToken: acc.refreshToken,
									chatgptAccountId: acc.chatgptAccountId,
									addedAt: Date.now(),
									lastUsed: index === 0 ? Date.now() : 0,
								})),
								activeIndex: 0,
							});
						} catch (error) {
							console.error("[openai-codex-plugin] Failed to save account metadata:", error);
						}

						const firstAcc = accounts[0]!;
						return {
							url: "",
							instructions: accounts.length > 1
								? `Multi-account setup complete! ${accounts.length} accounts configured.`
								: AUTH_LABELS.INSTRUCTIONS,
							method: "auto" as const,
							callback: async (): Promise<TokenSuccess> => ({
								type: "success",
								refresh: combinedRefresh,
								access: firstAcc.accessToken,
								expires: firstAcc.expiresAt,
							}),
						};
					},
				},
				{
					label: AUTH_LABELS.OAUTH_MANUAL,
					type: "oauth" as const,
					authorize: async () => {
						const { pkce, url } = await createAuthorizationFlow();
						return buildManualOAuthFlow(pkce, url);
					},
				},
				{
					label: AUTH_LABELS.API_KEY,
					type: "api" as const,
				},
			],
		},
	};
};

export default OpenAIAuthPlugin;
