/**
 * Helper functions for the custom fetch implementation
 * These functions break down the complex fetch logic into manageable, testable units
 */

import type { Auth } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { refreshAccessToken } from "../auth/auth.js";
import { logRequest } from "../logger.js";
import { getCodexInstructions, getModelFamily } from "../prompts/codex.js";
import { transformRequestBody, normalizeModel } from "./request-transformer.js";
import { convertSseToJson, ensureContentType } from "./response-handler.js";
import type { UserConfig, RequestBody } from "../types.js";
import {
        PLUGIN_NAME,
        HTTP_STATUS,
        OPENAI_HEADERS,
        OPENAI_HEADER_VALUES,
        URL_PATHS,
        ERROR_MESSAGES,
        LOG_STAGES,
} from "../constants.js";

export interface RateLimitInfo {
        retryAfterMs: number;
        code?: string;
}

export interface ErrorHandlingResult {
        response: Response;
        rateLimit?: RateLimitInfo;
}

/**
 * Determines if the current auth token needs to be refreshed
 * @param auth - Current authentication state
 * @returns True if token is expired or invalid
 */
export function shouldRefreshToken(auth: Auth): boolean {
	return auth.type !== "oauth" || !auth.access || auth.expires < Date.now();
}

/**
 * Refreshes the OAuth token and updates stored credentials
 * @param currentAuth - Current auth state
 * @param client - Opencode client for updating stored credentials
 * @returns Updated auth (throws on failure)
 */
export async function refreshAndUpdateToken(
	currentAuth: Auth,
	client: OpencodeClient,
): Promise<Auth> {
	const refreshToken = currentAuth.type === "oauth" ? currentAuth.refresh : "";
	const refreshResult = await refreshAccessToken(refreshToken);

	if (refreshResult.type === "failed") {
		throw new Error(ERROR_MESSAGES.TOKEN_REFRESH_FAILED);
	}

	// Update stored credentials
	await client.auth.set({
		path: { id: "openai" },
		body: {
			type: "oauth",
			access: refreshResult.access,
			refresh: refreshResult.refresh,
			expires: refreshResult.expires,
		},
	});

	// Update current auth reference if it's OAuth type
	if (currentAuth.type === "oauth") {
		currentAuth.access = refreshResult.access;
		currentAuth.refresh = refreshResult.refresh;
		currentAuth.expires = refreshResult.expires;
	}

	return currentAuth;
}

/**
 * Extracts URL string from various request input types
 * @param input - Request input (string, URL, or Request object)
 * @returns URL string
 */
export function extractRequestUrl(input: Request | string | URL): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	return input.url;
}

/**
 * Rewrites OpenAI API URLs to Codex backend URLs
 * @param url - Original URL
 * @returns Rewritten URL for Codex backend
 */
export function rewriteUrlForCodex(url: string): string {
	return url.replace(URL_PATHS.RESPONSES, URL_PATHS.CODEX_RESPONSES);
}

/**
 * Transforms request body and logs the transformation
 * Fetches model-specific Codex instructions based on the request model
 *
 * @param init - Request init options
 * @param url - Request URL
 * @param userConfig - User configuration
 * @param codexMode - Enable CODEX_MODE (bridge prompt instead of tool remap)
 * @returns Transformed body and updated init, or undefined if no body
 */
export async function transformRequestForCodex(
	init: RequestInit | undefined,
	url: string,
	userConfig: UserConfig,
	codexMode = true,
): Promise<{ body: RequestBody; updatedInit: RequestInit } | undefined> {
	if (!init?.body) return undefined;

	try {
		const body = JSON.parse(init.body as string) as RequestBody;
		const originalModel = body.model;

		// Normalize model first to determine which instructions to fetch
		// This ensures we get the correct model-specific prompt
		const normalizedModel = normalizeModel(originalModel);
		const modelFamily = getModelFamily(normalizedModel);

		// Log original request
		logRequest(LOG_STAGES.BEFORE_TRANSFORM, {
			url,
			originalModel,
			model: body.model,
			hasTools: !!body.tools,
			hasInput: !!body.input,
			inputLength: body.input?.length,
			codexMode,
			body: body as unknown as Record<string, unknown>,
		});

		// Fetch model-specific Codex instructions (cached per model family)
		const codexInstructions = await getCodexInstructions(normalizedModel);

		// Transform request body
		const transformedBody = await transformRequestBody(
			body,
			codexInstructions,
			userConfig,
			codexMode,
		);

		// Log transformed request
		logRequest(LOG_STAGES.AFTER_TRANSFORM, {
			url,
			originalModel,
			normalizedModel: transformedBody.model,
			modelFamily,
			hasTools: !!transformedBody.tools,
			hasInput: !!transformedBody.input,
			inputLength: transformedBody.input?.length,
			reasoning: transformedBody.reasoning as unknown,
			textVerbosity: transformedBody.text?.verbosity,
			include: transformedBody.include,
			body: transformedBody as unknown as Record<string, unknown>,
		});

		return {
			body: transformedBody,
			updatedInit: { ...init, body: JSON.stringify(transformedBody) },
		};
	} catch (e) {
		console.error(`[${PLUGIN_NAME}] ${ERROR_MESSAGES.REQUEST_PARSE_ERROR}:`, e);
		return undefined;
	}
}

/**
 * Creates headers for Codex API requests
 * @param init - Request init options
 * @param accountId - ChatGPT account ID
 * @param accessToken - OAuth access token
 * @returns Headers object with all required Codex headers
 */
export function createCodexHeaders(
    init: RequestInit | undefined,
    accountId: string,
    accessToken: string,
    opts?: { model?: string; promptCacheKey?: string },
): Headers {
	const headers = new Headers(init?.headers ?? {});
	headers.delete("x-api-key"); // Remove any existing API key
	headers.set("Authorization", `Bearer ${accessToken}`);
	headers.set(OPENAI_HEADERS.ACCOUNT_ID, accountId);
	headers.set(OPENAI_HEADERS.BETA, OPENAI_HEADER_VALUES.BETA_RESPONSES);
	headers.set(OPENAI_HEADERS.ORIGINATOR, OPENAI_HEADER_VALUES.ORIGINATOR_CODEX);

    const cacheKey = opts?.promptCacheKey;
    if (cacheKey) {
        headers.set(OPENAI_HEADERS.CONVERSATION_ID, cacheKey);
        headers.set(OPENAI_HEADERS.SESSION_ID, cacheKey);
    } else {
        headers.delete(OPENAI_HEADERS.CONVERSATION_ID);
        headers.delete(OPENAI_HEADERS.SESSION_ID);
    }
    headers.set("accept", "text/event-stream");
    return headers;
}

/**
 * Handles error responses from the Codex API
 * @param response - Error response from API
 * @returns Original response or mapped retryable response
 */
export async function handleErrorResponse(
        response: Response,
): Promise<ErrorHandlingResult> {
        const mapped = await mapUsageLimit404(response);
        const finalResponse = mapped ?? response;
        const rateLimit = await extractRateLimitInfo(finalResponse);

        logRequest(LOG_STAGES.ERROR_RESPONSE, {
                status: finalResponse.status,
                statusText: finalResponse.statusText,
        });

        return { response: finalResponse, rateLimit };
}

/**
 * Handles successful responses from the Codex API
 * Converts SSE to JSON for non-streaming requests (generateText)
 * Passes through SSE for streaming requests (streamText)
 * @param response - Success response from API
 * @param isStreaming - Whether this is a streaming request (stream=true in body)
 * @returns Processed response (SSE→JSON for non-streaming, stream for streaming)
 */
export async function handleSuccessResponse(
    response: Response,
    isStreaming: boolean,
): Promise<Response> {
    const responseHeaders = ensureContentType(response.headers);

	// For non-streaming requests (generateText), convert SSE to JSON
	if (!isStreaming) {
		return await convertSseToJson(response, responseHeaders);
	}

	// For streaming requests (streamText), return stream as-is
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders,
	});
}

async function mapUsageLimit404(response: Response): Promise<Response | null> {
        if (response.status !== HTTP_STATUS.NOT_FOUND) return null;

	const clone = response.clone();
	let text = "";
	try {
		text = await clone.text();
	} catch {
		text = "";
	}
	if (!text) return null;

	let code = "";
	try {
		const parsed = JSON.parse(text) as any;
		code = (parsed?.error?.code ?? parsed?.error?.type ?? "").toString();
	} catch {
		code = "";
	}

	const haystack = `${code} ${text}`.toLowerCase();
	if (!/usage_limit_reached|usage_not_included|rate_limit_exceeded|usage limit/i.test(haystack)) {
		return null;
	}

        const headers = new Headers(response.headers);
        return new Response(response.body, {
                status: HTTP_STATUS.TOO_MANY_REQUESTS,
                statusText: "Too Many Requests",
                headers,
        });
}

async function extractRateLimitInfo(
        response: Response,
): Promise<RateLimitInfo | undefined> {
        const isStatusRateLimit =
                response.status === HTTP_STATUS.TOO_MANY_REQUESTS;
        const body = await safeReadBody(response);
        const parsed = parseRateLimitBody(body);

        const haystack = `${parsed?.code ?? ""} ${body}`.toLowerCase();
        const isRateLimit =
                isStatusRateLimit ||
                /usage_limit_reached|usage_not_included|rate_limit_exceeded|rate_limit/i.test(
                        haystack,
                );
        if (!isRateLimit) return undefined;

        const retryAfterMs =
                parseRetryAfterMs(response, parsed) ?? 60000;

        return { retryAfterMs, code: parsed?.code };
}

async function safeReadBody(response: Response): Promise<string> {
        try {
                return await response.clone().text();
        } catch {
                return "";
        }
}

function parseRateLimitBody(
        body: string,
): { code?: string; resetsAt?: number; retryAfterMs?: number } | undefined {
        if (!body) return undefined;
        try {
                const parsed = JSON.parse(body) as any;
                const error = parsed?.error ?? {};
                const code = (error.code ?? error.type ?? "").toString();
                const resetsAt = toNumber(error.resets_at ?? error.reset_at);
                const retryAfterMs = toNumber(error.retry_after_ms ?? error.retry_after);
                return { code, resetsAt, retryAfterMs };
        } catch {
                return undefined;
        }
}

function parseRetryAfterMs(
        response: Response,
        parsedBody?: { resetsAt?: number; retryAfterMs?: number },
): number | null {
        if (parsedBody?.retryAfterMs !== undefined) {
                return normalizeRetryAfter(parsedBody.retryAfterMs);
        }

        const retryAfterMsHeader = response.headers.get("retry-after-ms");
        if (retryAfterMsHeader) {
                const parsed = Number.parseInt(retryAfterMsHeader, 10);
                if (!Number.isNaN(parsed) && parsed > 0) {
                        return parsed;
                }
        }

        const retryAfterHeader = response.headers.get("retry-after");
        if (retryAfterHeader) {
                const parsed = Number.parseInt(retryAfterHeader, 10);
                if (!Number.isNaN(parsed) && parsed > 0) {
                        return parsed * 1000;
                }
        }

        const resetAtHeaders = [
                "x-codex-primary-reset-at",
                "x-codex-secondary-reset-at",
                "x-ratelimit-reset",
        ];
        const now = Date.now();
        const resetCandidates: number[] = [];
        for (const header of resetAtHeaders) {
                const value = response.headers.get(header);
                if (!value) continue;
                const parsed = Number.parseInt(value, 10);
                if (!Number.isNaN(parsed) && parsed > 0) {
                        const timestamp =
                                parsed < 10_000_000_000 ? parsed * 1000 : parsed;
                        const delta = timestamp - now;
                        if (delta > 0) resetCandidates.push(delta);
                }
        }

        if (parsedBody?.resetsAt) {
                const timestamp =
                        parsedBody.resetsAt < 10_000_000_000
                                ? parsedBody.resetsAt * 1000
                                : parsedBody.resetsAt;
                const delta = timestamp - now;
                if (delta > 0) resetCandidates.push(delta);
        }

        if (resetCandidates.length > 0) {
                return Math.min(...resetCandidates);
        }

        return null;
}

function normalizeRetryAfter(value: number): number {
        if (!Number.isFinite(value)) return 60000;
        if (value > 0 && value < 1000) {
                return Math.floor(value * 1000);
        }
        return Math.floor(value);
}

function toNumber(value: unknown): number | undefined {
        if (value === null || value === undefined) return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
}
