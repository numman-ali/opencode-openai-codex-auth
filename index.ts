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

import { tool, type Plugin, type PluginInput } from "@opencode-ai/plugin";
import type { Auth } from "@opencode-ai/sdk";
import {
        createAuthorizationFlow,
        exchangeAuthorizationCode,
        parseAuthorizationInput,
        REDIRECT_URI,
} from "./lib/auth/auth.js";
import { openBrowserUrl } from "./lib/auth/browser.js";
import { startLocalOAuthServer } from "./lib/auth/server.js";
import { promptAddAnotherAccount, promptLoginMode } from "./lib/cli.js";
import { getCodexMode, loadPluginConfig } from "./lib/config.js";
import {
        AUTH_LABELS,
        CODEX_BASE_URL,
        DUMMY_API_KEY,
        LOG_STAGES,
        PLUGIN_NAME,
        PROVIDER_ID,
} from "./lib/constants.js";
import { logRequest, logDebug } from "./lib/logger.js";
import {
        AccountManager,
        extractAccountId,
        formatAccountLabel,
        formatCooldown,
        formatWaitTime,
} from "./lib/accounts.js";
import { getStoragePath, loadAccounts, saveAccounts } from "./lib/storage.js";
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
import type { OAuthAuthDetails, TokenResult, UserConfig } from "./lib/types.js";

const MAX_OAUTH_ACCOUNTS = 10;
const AUTH_FAILURE_COOLDOWN_MS = 30_000;

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
        let cachedAccountManager: AccountManager | null = null;

        type TokenSuccess = Extract<TokenResult, { type: "success" }>;

        const buildManualOAuthFlow = (
                pkce: { verifier: string },
                url: string,
                onSuccess?: (tokens: TokenSuccess) => Promise<void>,
        ) => ({
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
                        if (tokens?.type === "success" && onSuccess) {
                                await onSuccess(tokens);
                        }
                        return tokens?.type === "success"
                                ? tokens
                                : { type: "failed" as const };
                },
        });

        const promptOAuthCallbackValue = async (message: string): Promise<string> => {
                const { createInterface } = await import("node:readline/promises");
                const { stdin, stdout } = await import("node:process");
                const rl = createInterface({ input: stdin, output: stdout });
                try {
                        return (await rl.question(message)).trim();
                } finally {
                        rl.close();
                }
        };

        const runManualOAuthFlow = async (
                pkce: { verifier: string },
                url: string,
        ): Promise<TokenResult> => {
                console.log("1. Open the URL above in your browser and sign in.");
                console.log("2. After approving, copy the full redirect URL.");
                console.log("3. Paste it back here.\n");
                const callbackInput = await promptOAuthCallbackValue(
                        "Paste the redirect URL (or just the code) here: ",
                );
                const parsed = parseAuthorizationInput(callbackInput);
                if (!parsed.code) {
                        return { type: "failed" as const };
                }
                return await exchangeAuthorizationCode(
                        parsed.code,
                        pkce.verifier,
                        REDIRECT_URI,
                );
        };

        const runOAuthFlow = async (
                useManualMode: boolean,
        ): Promise<TokenResult> => {
                const { pkce, state, url } = await createAuthorizationFlow();
                console.log("\nOAuth URL:\n" + url + "\n");

                if (useManualMode) {
                        openBrowserUrl(url);
                        return await runManualOAuthFlow(pkce, url);
                }

                let serverInfo: Awaited<ReturnType<typeof startLocalOAuthServer>> | null = null;
                try {
                        serverInfo = await startLocalOAuthServer({ state });
                } catch {
                        serverInfo = null;
                }
                openBrowserUrl(url);

                if (!serverInfo || !serverInfo.ready) {
                        serverInfo?.close();
                        return await runManualOAuthFlow(pkce, url);
                }

                const result = await serverInfo.waitForCode(state);
                serverInfo.close();

                if (!result) {
                        return { type: "failed" as const };
                }

                return await exchangeAuthorizationCode(
                        result.code,
                        pkce.verifier,
                        REDIRECT_URI,
                );
        };

        const persistAccountPool = async (
                results: TokenSuccess[],
                replaceAll: boolean = false,
        ): Promise<void> => {
                if (results.length === 0) return;
                const now = Date.now();
                const stored = replaceAll ? null : await loadAccounts();
                const accounts = stored?.accounts ? [...stored.accounts] : [];

                const indexByRefreshToken = new Map<string, number>();
                const indexByAccountId = new Map<string, number>();
                for (let i = 0; i < accounts.length; i += 1) {
                        const account = accounts[i];
                        if (!account) continue;
                        if (account.refreshToken) {
                                indexByRefreshToken.set(account.refreshToken, i);
                        }
                        if (account.accountId) {
                                indexByAccountId.set(account.accountId, i);
                        }
                }

                for (const result of results) {
                        const accountId = extractAccountId(result.access);
                        const existingById =
                                accountId && indexByAccountId.has(accountId)
                                        ? indexByAccountId.get(accountId)
                                        : undefined;
                        const existingByToken = indexByRefreshToken.get(result.refresh);
                        const existingIndex = existingById ?? existingByToken;

                        if (existingIndex === undefined) {
                                const newIndex = accounts.length;
                                accounts.push({
                                        accountId,
                                        refreshToken: result.refresh,
                                        addedAt: now,
                                        lastUsed: now,
                                });
                                indexByRefreshToken.set(result.refresh, newIndex);
                                if (accountId) {
                                        indexByAccountId.set(accountId, newIndex);
                                }
                                continue;
                        }

                        const existing = accounts[existingIndex];
                        if (!existing) continue;

                        const oldToken = existing.refreshToken;
                        accounts[existingIndex] = {
                                ...existing,
                                accountId: accountId ?? existing.accountId,
                                refreshToken: result.refresh,
                                lastUsed: now,
                        };
                        if (oldToken !== result.refresh) {
                                indexByRefreshToken.delete(oldToken);
                                indexByRefreshToken.set(result.refresh, existingIndex);
                        }
                        if (accountId) {
                                indexByAccountId.set(accountId, existingIndex);
                        }
                }

                if (accounts.length === 0) return;

                const activeIndex = replaceAll
                        ? 0
                        : typeof stored?.activeIndex === "number" && Number.isFinite(stored.activeIndex)
                                ? stored.activeIndex
                                : 0;

                await saveAccounts({
                        version: 1,
                        accounts,
                        activeIndex: Math.max(0, Math.min(activeIndex, accounts.length - 1)),
                });
        };

        const showToast = async (
                message: string,
                variant: "info" | "success" | "warning" | "error" = "success",
        ): Promise<void> => {
                try {
                        await client.tui.showToast({
                                body: {
                                        message,
                                        variant,
                                },
                        });
                } catch {
                        // Ignore when TUI is not available.
                }
        };

        const resolveActiveIndex = (storage: { activeIndex: number; accounts: unknown[] }): number => {
                const total = storage.accounts.length;
                if (total === 0) return 0;
                const raw = Number.isFinite(storage.activeIndex) ? storage.activeIndex : 0;
                return Math.max(0, Math.min(raw, total - 1));
        };

        const formatRateLimitEntry = (
                account: { rateLimitResetTime?: number },
                now: number,
        ): string | null => {
                if (typeof account.rateLimitResetTime !== "number") return null;
                const remaining = account.rateLimitResetTime - now;
                if (remaining <= 0) return null;
                return `resets in ${formatWaitTime(remaining)}`;
        };

        return {
                auth: {
			provider: PROVIDER_ID,
			/**
			 * Loader function that configures OAuth authentication and request handling
			 *
			 * This function:
                         * 1. Validates OAuth authentication
                         * 2. Loads multi-account pool from disk (fallback to current auth)
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

                                const accountManager = await AccountManager.loadFromDisk(
                                        auth as OAuthAuthDetails,
                                );
                                cachedAccountManager = accountManager;
                                const storedSnapshot = await loadAccounts();
                                const refreshToken =
                                        auth.type === "oauth" ? auth.refresh : "";
                                const needsPersist =
                                        !storedSnapshot ||
                                        storedSnapshot.accounts.length !==
                                                accountManager.getAccountCount() ||
                                        (refreshToken &&
                                                !storedSnapshot.accounts.some(
                                                        (account) =>
                                                                account.refreshToken === refreshToken,
                                                ));
                                if (needsPersist) {
                                        await accountManager.saveToDisk();
                                }

                                if (accountManager.getAccountCount() === 0) {
                                        logDebug(
                                                `[${PLUGIN_NAME}] No OAuth accounts available (run opencode auth login)`,
                                        );
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
                                                // Step 1: Extract and rewrite URL for Codex backend
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
                                                const promptCacheKey = (transformation?.body as any)?.prompt_cache_key;
                                                const model = transformation?.body.model;

                                                const accountCount = accountManager.getAccountCount();
                                                const attempted = new Set<number>();

                                                while (attempted.size < Math.max(1, accountCount)) {
                                                        const account = accountManager.getCurrentOrNext();
                                                        if (!account || attempted.has(account.index)) {
                                                                break;
                                                        }
                                                        attempted.add(account.index);

                                                        let accountAuth = accountManager.toAuthDetails(account) as OAuthAuthDetails;
                                                        try {
                                                                if (shouldRefreshToken(accountAuth)) {
                                                                        accountAuth = (await refreshAndUpdateToken(
                                                                                accountAuth,
                                                                                client,
                                                                        )) as OAuthAuthDetails;
                                                                        accountManager.updateFromAuth(account, accountAuth);
                                                                        await accountManager.saveToDisk();
                                                                }
                                                        } catch (error) {
                                                                accountManager.markAccountCoolingDown(
                                                                        account,
                                                                        AUTH_FAILURE_COOLDOWN_MS,
                                                                        "auth-failure",
                                                                );
                                                                await accountManager.saveToDisk();
                                                                continue;
                                                        }

                                                        const accountId =
                                                                account.accountId ?? extractAccountId(accountAuth.access);
                                                        if (!accountId) {
                                                                accountManager.markAccountCoolingDown(
                                                                        account,
                                                                        AUTH_FAILURE_COOLDOWN_MS,
                                                                        "auth-failure",
                                                                );
                                                                await accountManager.saveToDisk();
                                                                continue;
                                                        }
                                                        account.accountId = accountId;

                                                        if (
                                                                accountCount > 1 &&
                                                                accountManager.shouldShowAccountToast(
                                                                        account.index,
                                                                )
                                                        ) {
                                                                const accountLabel = formatAccountLabel(
                                                                        account.accountId,
                                                                        account.index,
                                                                );
                                                                await showToast(
                                                                        `Using ${accountLabel} (${account.index + 1}/${accountCount})`,
                                                                        "info",
                                                                );
                                                                accountManager.markToastShown(
                                                                        account.index,
                                                                );
                                                        }

                                                        const headers = createCodexHeaders(
                                                                requestInit,
                                                                accountId,
                                                                accountAuth.access,
                                                                {
                                                                        model,
                                                                        promptCacheKey,
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
                                                        });

                                                        if (!response.ok) {
                                                                const { response: errorResponse, rateLimit } =
                                                                        await handleErrorResponse(response);
                                                                if (rateLimit) {
                                                                        accountManager.markRateLimited(
                                                                                account,
                                                                                rateLimit.retryAfterMs,
                                                                        );
                                                                        accountManager.markSwitched(
                                                                                account,
                                                                                "rate-limit",
                                                                        );
                                                                        await accountManager.saveToDisk();
                                                                        if (
                                                                                accountManager.getAccountCount() > 1 &&
                                                                                accountManager.shouldShowAccountToast(
                                                                                        account.index,
                                                                                )
                                                                        ) {
                                                                                await showToast(
                                                                                        "Rate limit reached. Switching accounts.",
                                                                                        "warning",
                                                                                );
                                                                                accountManager.markToastShown(
                                                                                        account.index,
                                                                                );
                                                                        }
                                                                        continue;
                                                                }
                                                                return errorResponse;
                                                        }

                                                        return await handleSuccessResponse(response, isStreaming);
                                                }

                                                const waitMs = accountManager.getMinWaitTime();
                                                const count = accountManager.getAccountCount();
                                                const waitLabel = waitMs > 0 ? formatWaitTime(waitMs) : "a bit";
                                                const message =
                                                        count === 0
                                                                ? "No OpenAI accounts configured. Run `opencode auth login`."
                                                                : `All ${count} account(s) are rate-limited. Try again in ${waitLabel} or add another account with \`opencode auth login\`.`;
                                                return new Response(
                                                        JSON.stringify({ error: { message } }),
                                                        {
                                                                status: 429,
                                                                headers: {
                                                                        "content-type": "application/json; charset=utf-8",
                                                                },
                                                        },
                                                );
                                        },
                                };
                        },
				methods: [
					{
						label: AUTH_LABELS.OAUTH,
						type: "oauth" as const,
					/**
					 * OAuth authorization flow
					 *
					 * Steps:
					 * 1. Generate PKCE challenge and state for security
					 * 2. Start local OAuth callback server on port 1455
					 * 3. Open browser to OpenAI authorization page
					 * 4. Wait for user to complete login
					 * 5. Exchange authorization code for tokens
					 *
					 * @returns Authorization flow configuration
					 */
                                        authorize: async (inputs?: Record<string, string>) => {
                                                if (inputs) {
                                                        const accounts: TokenSuccess[] = [];
                                                        const noBrowser =
                                                                inputs.noBrowser === "true" ||
                                                                inputs["no-browser"] === "true";
                                                        const useManualMode = noBrowser;

                                                        let startFresh = true;
                                                        const existingStorage = await loadAccounts();
                                                        if (existingStorage && existingStorage.accounts.length > 0) {
                                                                const existingAccounts = existingStorage.accounts.map(
                                                                        (account, index) => ({
                                                                                accountId: account.accountId,
                                                                                index,
                                                                        }),
                                                                );
                                                                const loginMode = await promptLoginMode(existingAccounts);
                                                                startFresh = loginMode === "fresh";
                                                                if (startFresh) {
                                                                        console.log(
                                                                                "\nStarting fresh - existing accounts will be replaced.\n",
                                                                        );
                                                                } else {
                                                                        console.log("\nAdding to existing accounts.\n");
                                                                }
                                                        }

                                                        while (accounts.length < MAX_OAUTH_ACCOUNTS) {
                                                                console.log(
                                                                        `\n=== OpenAI OAuth (Account ${
                                                                                accounts.length + 1
                                                                        }) ===`,
                                                                );
                                                                const result = await runOAuthFlow(useManualMode);
                                                                if (result.type === "failed") {
                                                                        if (accounts.length === 0) {
                                                                                return {
                                                                                        url: "",
                                                                                        instructions:
                                                                                                "Authentication failed.",
                                                                                        method: "auto",
                                                                                        callback: async () => result,
                                                                                };
                                                                        }
                                                                        console.warn(
                                                                                `[${PLUGIN_NAME}] Skipping failed account ${
                                                                                        accounts.length + 1
                                                                                }`,
                                                                        );
                                                                        break;
                                                                }

                                                                accounts.push(result);
                                                                await showToast(
                                                                        `Account ${accounts.length} authenticated`,
                                                                        "success",
                                                                );

                                                                try {
                                                                        const isFirstAccount = accounts.length === 1;
                                                                        await persistAccountPool(
                                                                                [result],
                                                                                isFirstAccount && startFresh,
                                                                        );
                                                                } catch {
                                                                        // Ignore storage failures
                                                                }

                                                                if (accounts.length >= MAX_OAUTH_ACCOUNTS) {
                                                                        break;
                                                                }

                                                                let currentAccountCount = accounts.length;
                                                                try {
                                                                        const currentStorage = await loadAccounts();
                                                                        if (currentStorage) {
                                                                                currentAccountCount = currentStorage.accounts.length;
                                                                        }
                                                                } catch {
                                                                        // Ignore storage read failures
                                                                }

                                                                const addAnother = await promptAddAnotherAccount(
                                                                        currentAccountCount,
                                                                );
                                                                if (!addAnother) {
                                                                        break;
                                                                }
                                                        }

                                                        const primary = accounts[0];
                                                        if (!primary) {
                                                                return {
                                                                        url: "",
                                                                        instructions: "Authentication cancelled",
                                                                        method: "auto",
                                                                        callback: async () => ({
                                                                                type: "failed" as const,
                                                                        }),
                                                                };
                                                        }

                                                        let actualAccountCount = accounts.length;
                                                        try {
                                                                const finalStorage = await loadAccounts();
                                                                if (finalStorage) {
                                                                        actualAccountCount = finalStorage.accounts.length;
                                                                }
                                                        } catch {
                                                                // Ignore storage read failures
                                                        }

                                                        return {
                                                                url: "",
                                                                instructions: `Multi-account setup complete (${actualAccountCount} account(s)).`,
                                                                method: "auto",
                                                                callback: async () => primary,
                                                        };
                                                }

                                                const { pkce, state, url } = await createAuthorizationFlow();
                                                let serverInfo: Awaited<ReturnType<typeof startLocalOAuthServer>> | null =
                                                        null;
                                                try {
                                                        serverInfo = await startLocalOAuthServer({ state });
                                                } catch {
                                                        serverInfo = null;
                                                }

                                                openBrowserUrl(url);

                                                if (!serverInfo || !serverInfo.ready) {
                                                        serverInfo?.close();
                                                        return buildManualOAuthFlow(pkce, url, async (tokens) => {
                                                                await persistAccountPool([tokens], false);
                                                        });
                                                }

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

                                                                if (tokens?.type === "success") {
                                                                        await persistAccountPool([tokens], false);
                                                                }

                                                                return tokens?.type === "success"
                                                                        ? tokens
                                                                        : { type: "failed" as const };
                                                        },
                                                };
                                        },
					},
					{
						label: AUTH_LABELS.OAUTH_MANUAL,
						type: "oauth" as const,
                                                authorize: async () => {
                                                        const { pkce, url } = await createAuthorizationFlow();
                                                        return buildManualOAuthFlow(pkce, url, async (tokens) => {
                                                                await persistAccountPool([tokens], false);
                                                        });
                                                },
					},
					{
						label: AUTH_LABELS.API_KEY,
						type: "api" as const,
					},
			],
                },
                tool: {
                        "openai-accounts": tool({
                                description:
                                        "List all OpenAI OAuth accounts and the current active index.",
                                args: {},
                                async execute() {
                                        const storage = await loadAccounts();
                                        const storePath = getStoragePath();

                                        if (!storage || storage.accounts.length === 0) {
                                                return [
                                                        "No OpenAI accounts configured.",
                                                        "",
                                                        "Add accounts:",
                                                        "  opencode auth login",
                                                        "",
                                                        `Storage: ${storePath}`,
                                                ].join("\n");
                                        }

                                        const now = Date.now();
                                        const activeIndex = resolveActiveIndex(storage);
                                        const lines: string[] = [
                                                `OpenAI Accounts (${storage.accounts.length}):`,
                                                "",
                                        ];

                                        storage.accounts.forEach((account, index) => {
                                                const label = formatAccountLabel(
                                                        account.accountId,
                                                        index,
                                                );
                                                const statuses: string[] = [];
                                                const rateLimit = formatRateLimitEntry(
                                                        account,
                                                        now,
                                                );
                                                if (index === activeIndex) statuses.push("active");
                                                if (rateLimit) statuses.push("rate-limited");
                                                if (
                                                        typeof account.coolingDownUntil ===
                                                                "number" &&
                                                        account.coolingDownUntil > now
                                                ) {
                                                        statuses.push("cooldown");
                                                }
                                                const suffix =
                                                        statuses.length > 0
                                                                ? ` (${statuses.join(", ")})`
                                                                : "";
                                                lines.push(`  ${index + 1}. ${label}${suffix}`);
                                        });

                                        lines.push("");
                                        lines.push(`Storage: ${storePath}`);
                                        lines.push("");
                                        lines.push("Commands:");
                                        lines.push("  - Add account: opencode auth login");
                                        lines.push("  - Switch account: openai-accounts-switch");
                                        lines.push("  - Status details: openai-accounts-status");

                                        return lines.join("\n");
                                },
                        }),
                        "openai-accounts-switch": tool({
                                description: "Switch active OpenAI account by index (1-based).",
                                args: {
                                        index: tool.schema.number().describe(
                                                "Account number to switch to (1-based, e.g., 1 for first account)",
                                        ),
                                },
                                async execute({ index }) {
                                        const storage = await loadAccounts();
                                        if (!storage || storage.accounts.length === 0) {
                                                return "No OpenAI accounts configured. Run: opencode auth login";
                                        }

                                        const targetIndex = Math.floor((index ?? 0) - 1);
                                        if (
                                                !Number.isFinite(targetIndex) ||
                                                targetIndex < 0 ||
                                                targetIndex >= storage.accounts.length
                                        ) {
                                                return `Invalid account number: ${index}\n\nValid range: 1-${storage.accounts.length}`;
                                        }

                                        const now = Date.now();
                                        const account = storage.accounts[targetIndex];
                                        if (account) {
                                                account.lastUsed = now;
                                                account.lastSwitchReason = "rotation";
                                        }

                                        storage.activeIndex = targetIndex;
                                        await saveAccounts(storage);

                                        if (cachedAccountManager) {
                                                cachedAccountManager.setActiveIndex(targetIndex);
                                                await cachedAccountManager.saveToDisk();
                                        }

                                        const label = formatAccountLabel(account?.accountId, targetIndex);
                                        return `Switched to account: ${label}`;
                                },
                        }),
                        "openai-accounts-status": tool({
                                description: "Show detailed status of OpenAI accounts and rate limits.",
                                args: {},
                                async execute() {
                                        const storage = await loadAccounts();
                                        if (!storage || storage.accounts.length === 0) {
                                                return "No OpenAI accounts configured. Run: opencode auth login";
                                        }

                                        const now = Date.now();
                                        const activeIndex = resolveActiveIndex(storage);
                                        const lines: string[] = [
                                                `Account Status (${storage.accounts.length} total):`,
                                                "",
                                        ];

                                        storage.accounts.forEach((account, index) => {
                                                const label = formatAccountLabel(
                                                        account.accountId,
                                                        index,
                                                );
                                                lines.push(`${index + 1}. ${label}`);
                                                lines.push(
                                                        `   Active: ${index === activeIndex ? "Yes" : "No"}`,
                                                );

                                                const rateLimit = formatRateLimitEntry(account, now);
                                                lines.push(
                                                        `   Rate Limit: ${rateLimit ?? "None"}`,
                                                );

                                                const cooldown = formatCooldown(
                                                        account as any,
                                                        now,
                                                );
                                                if (cooldown) {
                                                        lines.push(`   Cooldown: Yes (${cooldown})`);
                                                } else {
                                                        lines.push("   Cooldown: No");
                                                }

                                                if (
                                                        typeof account.lastUsed === "number" &&
                                                        account.lastUsed > 0
                                                ) {
                                                        lines.push(
                                                                `   Last Used: ${formatWaitTime(
                                                                        now - account.lastUsed,
                                                                )} ago`,
                                                        );
                                                }

                                                lines.push("");
                                        });

                                        return lines.join("\n");
                                },
                        }),
                },
        };
};

export default OpenAIAuthPlugin;
