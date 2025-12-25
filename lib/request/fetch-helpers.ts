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
	OPENAI_HEADERS,
	OPENAI_HEADER_VALUES,
	URL_PATHS,
	ERROR_MESSAGES,
	LOG_STAGES,
} from "../constants.js";

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
 * @returns Updated auth state
 * @throws Error if token refresh fails
 */
export async function refreshAndUpdateToken(
	currentAuth: Auth,
	client: OpencodeClient,
): Promise<Auth> {
	const refreshToken = currentAuth.type === "oauth" ? currentAuth.refresh : "";
	const refreshResult = await refreshAccessToken(refreshToken);

	if (refreshResult.type === "failed") {
		throw new Error(`[${PLUGIN_NAME}] ${ERROR_MESSAGES.TOKEN_REFRESH_FAILED}`);
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
 * Logs error details and returns the response for OpenCode/AI SDK to process
 * @param response - Error response from API
 * @returns Original response (AI SDK will convert to APICallError)
 */
export async function handleErrorResponse(
    response: Response,
): Promise<Response> {
	// Clone response so we can read body for logging while preserving original
	const cloned = response.clone();
	const raw = await cloned.text();

	let friendly_message: string | undefined;
	try {
		const parsed = JSON.parse(raw) as any;
		const err = parsed?.error ?? {};

		// Parse Codex rate-limit headers if present
		const h = response.headers;
		const primary = {
			resets_at: toInt(h.get("x-codex-primary-reset-at")),
		};
		const secondary = {
			resets_at: toInt(h.get("x-codex-secondary-reset-at")),
		};

		// Friendly message for subscription/rate usage limits
		const code = (err.code ?? err.type ?? "").toString();
		const resetsAt = err.resets_at ?? primary.resets_at ?? secondary.resets_at;
		const mins = resetsAt ? Math.max(0, Math.round((resetsAt * 1000 - Date.now()) / 60000)) : undefined;
		if (/usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code) || response.status === 429) {
			const plan = err.plan_type ? ` (${String(err.plan_type).toLowerCase()} plan)` : "";
			const when = mins !== undefined ? ` Try again in ~${mins} min.` : "";
			friendly_message = `You have hit your ChatGPT usage limit${plan}.${when}`.trim();
		}
	} catch {
		// Raw body not JSON; ignore
	}

	// Log friendly message if available, otherwise status code
	if (friendly_message) {
		console.error(`[${PLUGIN_NAME}] ${friendly_message}`);
	} else {
		console.error(`[${PLUGIN_NAME}] API error: ${response.status} ${response.statusText}`);
	}
	logRequest(LOG_STAGES.ERROR_RESPONSE, {
		status: response.status,
		friendly_message,
	});

	// Return original response - OpenCode/AI SDK will handle HTTP errors
	return response;
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

function toInt(v: string | null): number | undefined {
    if (v == null) return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
}
