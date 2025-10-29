/**
 * Helper functions for the custom fetch implementation
 * These functions break down the complex fetch logic into manageable, testable units
 */

import type { Auth } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { refreshAccessToken } from "../auth/auth.js";
import { logRequest } from "../logger.js";
import { transformRequestBody } from "./request-transformer.js";
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
 * @returns Updated auth or error response
 */
export async function refreshAndUpdateToken(
	currentAuth: Auth,
	client: OpencodeClient,
): Promise<
	{ success: true; auth: Auth } | { success: false; response: Response }
> {
	const refreshToken = currentAuth.type === "oauth" ? currentAuth.refresh : "";
	const refreshResult = await refreshAccessToken(refreshToken);

	if (refreshResult.type === "failed") {
		console.error(`[${PLUGIN_NAME}] ${ERROR_MESSAGES.TOKEN_REFRESH_FAILED}`);
		return {
			success: false,
			response: new Response(
				JSON.stringify({ error: "Token refresh failed" }),
				{ status: HTTP_STATUS.UNAUTHORIZED },
			),
		};
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

	return { success: true, auth: currentAuth };
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
 * @param init - Request init options
 * @param url - Request URL
 * @param codexInstructions - Codex system instructions
 * @param userConfig - User configuration
 * @param codexMode - Enable CODEX_MODE (bridge prompt instead of tool remap)
 * @returns Transformed body and updated init, or undefined if no body
 */
export async function transformRequestForCodex(
    init: RequestInit | undefined,
    url: string,
    codexInstructions: string,
    userConfig: UserConfig,
    codexMode = true,
    promptCacheKey?: string,
): Promise<{ body: RequestBody; updatedInit: RequestInit } | undefined> {
	if (!init?.body) return undefined;

	try {
		const body = JSON.parse(init.body as string) as RequestBody;
		const originalModel = body.model;

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

		// Transform request body
        const transformedBody = await transformRequestBody(
            body,
            codexInstructions,
            userConfig,
            codexMode,
            promptCacheKey,
        );

		// Log transformed request
		logRequest(LOG_STAGES.AFTER_TRANSFORM, {
			url,
			originalModel,
			normalizedModel: transformedBody.model,
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
    sessionOrConversationId?: string,
): Headers {
	const headers = new Headers(init?.headers ?? {});
	headers.delete("x-api-key"); // Remove any existing API key
	headers.set("Authorization", `Bearer ${accessToken}`);
	headers.set(OPENAI_HEADERS.ACCOUNT_ID, accountId);
	headers.set(OPENAI_HEADERS.BETA, OPENAI_HEADER_VALUES.BETA_RESPONSES);
	headers.set(OPENAI_HEADERS.ORIGINATOR, OPENAI_HEADER_VALUES.ORIGINATOR_CODEX);
    const sid = sessionOrConversationId || (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    headers.set(OPENAI_HEADERS.SESSION_ID, sid);
    headers.set(OPENAI_HEADERS.CONVERSATION_ID, sid);
	return headers;
}

/**
 * Handles error responses from the Codex API
 * @param response - Error response from API
 * @returns Response with error details
 */
export async function handleErrorResponse(
	response: Response,
): Promise<Response> {
	const text = await response.text();
	console.error(`[${PLUGIN_NAME}] ${response.status} error:`, text);

	logRequest(LOG_STAGES.ERROR_RESPONSE, {
		status: response.status,
		error: text,
	});

	return new Response(text, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

/**
 * Handles successful responses from the Codex API
 * Converts SSE to JSON for non-tool requests
 * @param response - Success response from API
 * @param hasTools - Whether the request included tools
 * @returns Processed response (SSE→JSON for non-tool, stream for tool requests)
 */
export async function handleSuccessResponse(
	response: Response,
	hasTools: boolean,
): Promise<Response> {
	const responseHeaders = ensureContentType(response.headers);

	// For non-tool requests (compact/summarize), convert streaming SSE to JSON
	// generateText() expects a non-streaming JSON response, not SSE
	if (!hasTools) {
		return await convertSseToJson(response, responseHeaders);
	}

	// For tool requests, return stream as-is (streamText handles SSE)
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders,
	});
}
