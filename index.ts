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
	REDIRECT_URI,
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
	OPENAI_HEADER_VALUES,
	OPENAI_HEADERS,
	PLUGIN_NAME,
	PROVIDER_ID,
} from "./lib/constants.js";
import { logRequest } from "./lib/logger.js";
import {
	createCodexHeaders,
	extractRequestUrl,
	handleErrorResponse,
	handleSuccessResponse,
	refreshAndUpdateToken,
	rewriteUrlForCodex,
	shouldRefreshToken,
	transformRequestForCodex,
} from "./lib/request/fetch-helpers.js";
import type { UserConfig } from "./lib/types.js";

/**
 * OpenAI Codex OAuth authentication plugin for opencode
 *
 * This plugin enables opencode to use OpenAI's Codex backend via ChatGPT Plus/Pro
 * OAuth authentication, allowing users to leverage their ChatGPT subscription
 * instead of OpenAI Platform API credits.
 *
 * @example
 * ```json
 * {
 *   "plugin": ["opencode-openai-codex-auth"],
 *   "model": "openai/gpt-5-codex"
 * }
 * ```
 */
export const OpenAIAuthPlugin: Plugin = async ({ client }: PluginInput) => {
	return {
		auth: {
			provider: PROVIDER_ID,
			/**
			 * Loader function that configures OAuth authentication and request handling
			 *
			 * This function:
			 * 1. Validates OAuth authentication
			 * 2. Extracts ChatGPT account ID from access token
			 * 3. Loads user configuration from opencode.json
			 * 4. Fetches Codex system instructions from GitHub (cached)
			 * 5. Returns SDK configuration with custom fetch implementation
			 *
			 * @param getAuth - Function to retrieve current auth state
			 * @param provider - Provider configuration from opencode.json
			 * @returns SDK configuration object or empty object for non-OAuth auth
			 */
			async loader(getAuth: () => Promise<Auth>, provider: unknown) {
				const auth = await getAuth();

				// Only handle OAuth auth type, skip API key auth
				if (auth.type !== "oauth") {
					return {};
				}

				// Extract ChatGPT account ID from JWT access token
				const decoded = decodeJWT(auth.access);
				const accountId = decoded?.[JWT_CLAIM_PATH]?.chatgpt_account_id;

                if (!accountId) {
                    console.error(`[${PLUGIN_NAME}] ${ERROR_MESSAGES.NO_ACCOUNT_ID}`);
                    return {};
                }
				// Extract user configuration (global + per-model options)
				const providerConfig = provider as
					| { options?: Record<string, unknown>; models?: UserConfig["models"] }
					| undefined;
				const userConfig: UserConfig = {
					global: providerConfig?.options || {},
					models: providerConfig?.models || {},
				};

				// Load plugin configuration and determine CODEX_MODE
				// Priority: CODEX_MODE env var > config file > default (true)
				const pluginConfig = loadPluginConfig();
				const codexMode = getCodexMode(pluginConfig);

				// Return SDK configuration
				return {
					apiKey: DUMMY_API_KEY,
					baseURL: CODEX_BASE_URL,
					/**
					 * Custom fetch implementation for Codex API
					 *
					 * Handles:
					 * - Token refresh when expired
					 * - URL rewriting for Codex backend
					 * - Request body transformation
					 * - OAuth header injection
					 * - SSE to JSON conversion for non-tool requests
					 * - Error handling and logging
					 *
					 * @param input - Request URL or Request object
					 * @param init - Request options
					 * @returns Response from Codex API
					 */
					async fetch(
						input: Request | string | URL,
						init?: RequestInit,
					): Promise<Response> {
						// Step 1: Check and refresh token if needed
						const currentAuth = await getAuth();
						if (shouldRefreshToken(currentAuth)) {
							const refreshResult = await refreshAndUpdateToken(
								currentAuth,
								client,
							);
							if (!refreshResult.success) {
								return refreshResult.response;
							}
						}

						// Step 2: Extract and rewrite URL for Codex backend
						const originalUrl = extractRequestUrl(input);
						const url = rewriteUrlForCodex(originalUrl);

						// Step 3: Transform request body with model-specific Codex instructions
						// Instructions are fetched per model family (codex-max, codex, gpt-5.1)
						// Capture original stream value before transformation
						// generateText() sends no stream field, streamText() sends stream=true
						const originalBody = init?.body ? JSON.parse(init.body as string) : {};
						const isStreaming = originalBody.stream === true;

						const transformation = await transformRequestForCodex(
							init,
							url,
							userConfig,
							codexMode,
						);
						const requestInit = transformation?.updatedInit ?? init;

						// Step 4: Create headers with OAuth and ChatGPT account info
						const accessToken =
							currentAuth.type === "oauth" ? currentAuth.access : "";
						const headers = createCodexHeaders(
							requestInit,
							accountId,
							accessToken,
							{
								model: transformation?.body.model,
								promptCacheKey: (transformation?.body as any)?.prompt_cache_key,
							},
						);

						// Step 5: Make request to Codex API
						const response = await fetch(url, {
							...requestInit,
							headers,
						});

						// Step 6: Log response
						logRequest(LOG_STAGES.RESPONSE, {
							status: response.status,
							ok: response.ok,
							statusText: response.statusText,
							headers: Object.fromEntries(response.headers.entries()),
						});

						// Step 7: Handle error or success response
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
					/**
					 * OAuth authorization flow with automatic localhost callback
					 *
					 * Steps:
					 * 1. Generate PKCE challenge and state for security
					 * 2. Start local OAuth callback server on port 1455
					 * 3. Open browser to OpenAI authorization page
					 * 4. Wait for callback to localhost server
					 * 5. Exchange authorization code for tokens
					 *
					 * This is the default flow that works when the browser can
					 * reach localhost:1455. If this fails, use the manual paste option.
					 *
					 * @returns Authorization flow configuration
					 */
					authorize: async () => {
						const { pkce, state, url } = await createAuthorizationFlow();
						const serverInfo = await startLocalOAuthServer({ state });

						// Attempt to open browser automatically
						openBrowserUrl(url);

						return {
							url,
							method: "auto" as const,
							instructions: AUTH_LABELS.INSTRUCTIONS,
							callback: async () => {
								const result = await serverInfo.waitForCode(state);
								serverInfo.close();

								if (!result) {
									return { type: "failed" as const };
								}

								const tokens = await exchangeAuthorizationCode(
									result.code,
									pkce.verifier,
									REDIRECT_URI,
								);

								return tokens?.type === "success"
									? tokens
									: { type: "failed" as const };
							},
						};
					},
				},
				{
					label: "ChatGPT Plus/Pro (Manual URL Paste)",
					type: "oauth" as const,
					/**
					 * OAuth authorization flow with manual URL paste
					 *
					 * Steps:
					 * 1. Generate PKCE challenge and state for security
					 * 2. Open browser to OpenAI authorization page
					 * 3. User completes login and copies redirect URL
					 * 4. User pastes URL back into terminal
					 * 5. Exchange authorization code for tokens
					 *
					 * Use this flow when localhost callbacks don't work:
					 * - Remote servers (SSH)
					 * - Containers/Docker
					 * - WSL without localhost forwarding
					 *
					 * @returns Authorization flow configuration
					 */
					authorize: async () => {
						const { pkce, state, url } = await createAuthorizationFlow();

						// Attempt to open browser automatically
						openBrowserUrl(url);

						return {
							url,
							method: "code" as const,
							instructions: "1. Open the URL above in your browser and complete login.\n2. After login, your browser will redirect to localhost (which may fail to load).\n3. Copy the FULL URL from your browser's address bar and paste it below.\n   (It looks like: http://localhost:1455/auth/callback?code=...&state=...)",
							callback: async (input: string) => {
								const { parseAuthorizationInput } = await import("./lib/auth/auth.js");
								const parsed = parseAuthorizationInput(input);

								if (!parsed.code) {
									console.error("[openai-codex-plugin] No authorization code found in input");
									return { type: "failed" as const };
								}

								const tokens = await exchangeAuthorizationCode(
									parsed.code,
									pkce.verifier,
									REDIRECT_URI,
								);

								return tokens?.type === "success"
									? tokens
									: { type: "failed" as const };
							},
						};
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
