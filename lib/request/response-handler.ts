import { logRequest, LOGGING_ENABLED } from "../logger.js";
import type { SSEEventData } from "../types.js";

/**
 * Parse SSE stream to extract final response
 * @param sseText - Complete SSE stream text
 * @returns Final response object, last response-like, or last event
 */
function parseSseStream(sseText: string): {
	finalResponse?: unknown;
	lastEvent?: unknown;
	lastResponseLike?: unknown;
} {
	const lines = sseText.split(/\r?\n/);
	let pendingData: string[] = [];
	let lastEvent: unknown;
	let lastResponseLike: unknown;
	let finalResponse: unknown;

	/**
	 * Process a parsed event, updating tracking variables
	 */
	const processEvent = (parsed: SSEEventData) => {
		lastEvent = parsed;
		const parsedAny = parsed as unknown as {
			type?: string;
			response?: unknown;
		};
		if (
			parsedAny &&
			typeof parsedAny === "object" &&
			"response" in parsedAny
		) {
			if (parsedAny.response !== undefined) {
				lastResponseLike = parsedAny.response;
			}
			if (
				parsedAny.type === "response.done" ||
				parsedAny.type === "response.completed"
			) {
				finalResponse = parsedAny.response;
			}
		}
	};

	/**
	 * Try to parse accumulated data. Returns true if successful.
	 */
	const tryFlush = (): boolean => {
		if (pendingData.length === 0) return false;
		const data = pendingData.join("\n");
		try {
			const parsed = JSON.parse(data) as SSEEventData;
			pendingData = [];
			processEvent(parsed);
			return true;
		} catch {
			return false;
		}
	};

	for (const line of lines) {
		// Empty line = SSE event delimiter, flush any pending data
		if (line === "") {
			tryFlush();
			pendingData = []; // Clear any unparseable garbage
			continue;
		}

		// Accept "data:" with or without a space after colon
		if (line.startsWith("data:")) {
			const content = line.replace(/^data:\s?/, "");
			pendingData.push(content);

			// Optimistic parse: try to parse immediately (common case: each line is complete JSON)
			if (!tryFlush()) {
				// If combined parse failed, try parsing just this line alone
				// This handles the case where previous lines were garbage
				try {
					const parsed = JSON.parse(content) as SSEEventData;
					pendingData = []; // Discard accumulated garbage
					processEvent(parsed);
				} catch {
					// Keep accumulating - might be multiline JSON
				}
			}
			continue;
		}
	}

	// Final flush for any remaining data
	tryFlush();

	return { finalResponse, lastEvent, lastResponseLike };
}

/**
 * Convert SSE stream response to JSON for generateText()
 * @param response - Fetch response with SSE stream
 * @param headers - Response headers
 * @returns Response with JSON body
 */
export async function convertSseToJson(response: Response, headers: Headers): Promise<Response> {
	if (!response.body) {
		throw new Error('[openai-codex-plugin] Response has no body');
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let fullText = '';

	try {
		// Consume the entire stream
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			fullText += decoder.decode(value, { stream: true });
		}

		if (LOGGING_ENABLED) {
			logRequest("stream-full", { fullContent: fullText });
		}

		// Parse SSE events to extract the final response
		const parsed = parseSseStream(fullText);
		const responsePayload =
			parsed.finalResponse ?? parsed.lastResponseLike ?? parsed.lastEvent;

		if (!responsePayload) {
			console.error("[openai-codex-plugin] Could not find JSON in SSE stream");
			logRequest("stream-error", {
				error: "No JSON events found in SSE stream",
			});

			// Return original stream if we can't parse anything
			return new Response(fullText, {
				status: response.status,
				statusText: response.statusText,
				headers: headers,
			});
		}

		// Return as plain JSON (not SSE)
		const jsonHeaders = new Headers(headers);
		jsonHeaders.set("content-type", "application/json; charset=utf-8");

		if (!parsed.finalResponse) {
			logRequest("stream-warning", {
				warning: "No final response event; using last JSON event",
			});
		}

		return new Response(JSON.stringify(responsePayload), {
			status: response.status,
			statusText: response.statusText,
			headers: jsonHeaders,
		});

	} catch (error) {
		console.error('[openai-codex-plugin] Error converting stream:', error);
		logRequest("stream-error", { error: String(error) });
		throw error;
	}
}

/**
 * Ensure response has content-type header
 * @param headers - Response headers
 * @returns Headers with content-type set
 */
export function ensureContentType(headers: Headers): Headers {
	const responseHeaders = new Headers(headers);

	if (!responseHeaders.has('content-type')) {
		responseHeaders.set('content-type', 'text/event-stream; charset=utf-8');
	}

	return responseHeaders;
}
