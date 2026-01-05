import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { PLUGIN_NAME } from "./constants.js";

// Logging configuration
export const LOGGING_ENABLED = process.env.ENABLE_PLUGIN_REQUEST_LOGGING === "1";
export const DEBUG_ENABLED = process.env.DEBUG_CODEX_PLUGIN === "1" || LOGGING_ENABLED;
const LOG_DIR = join(homedir(), ".opencode", "logs", "codex-plugin");

// Log startup message about logging state
if (LOGGING_ENABLED) {
	console.log(`[${PLUGIN_NAME}] Request logging ENABLED - logs will be saved to:`, LOG_DIR);
}
if (DEBUG_ENABLED && !LOGGING_ENABLED) {
	console.log(`[${PLUGIN_NAME}] Debug logging ENABLED`);
}

let requestCounter = 0;

/**
 * Log request data to file (only when LOGGING_ENABLED is true)
 * @param stage - The stage of the request (e.g., "before-transform", "after-transform")
 * @param data - The data to log
 */
export function logRequest(stage: string, data: Record<string, unknown>): void {
	// Only log if explicitly enabled via environment variable
	if (!LOGGING_ENABLED) return;

	// Ensure log directory exists on first log
	if (!existsSync(LOG_DIR)) {
		mkdirSync(LOG_DIR, { recursive: true });
	}

	const timestamp = new Date().toISOString();
	const requestId = ++requestCounter;
	const filename = join(LOG_DIR, `request-${requestId}-${stage}.json`);

	try {
		writeFileSync(
			filename,
			JSON.stringify(
				{
					timestamp,
					requestId,
					stage,
					...data,
				},
				null,
				2,
			),
			"utf8",
		);
		console.log(`[${PLUGIN_NAME}] Logged ${stage} to ${filename}`);
	} catch (e) {
		const error = e as Error;
		console.error(`[${PLUGIN_NAME}] Failed to write log:`, error.message);
	}
}

/**
 * Log debug information (only when DEBUG_ENABLED is true)
 * @param message - Debug message
 * @param data - Optional data to log
 */
export function logDebug(message: string, data?: unknown): void {
	if (!DEBUG_ENABLED) return;

	if (data !== undefined) {
		console.log(`[${PLUGIN_NAME}] ${message}`, data);
	} else {
		console.log(`[${PLUGIN_NAME}] ${message}`);
	}
}

/**
 * Log warning (always enabled for important issues)
 * @param message - Warning message
 * @param data - Optional data to log
 */
export function logWarn(message: string, data?: unknown): void {
        if (!DEBUG_ENABLED && !LOGGING_ENABLED) return;
        if (data !== undefined) {
                console.warn(`[${PLUGIN_NAME}] ${message}`, data);
        } else {
                console.warn(`[${PLUGIN_NAME}] ${message}`);
        }
}

export function createLogger(scope: string) {
        const prefix = `[${PLUGIN_NAME}:${scope}]`;
        return {
                info(message: string, data?: unknown) {
                        if (!DEBUG_ENABLED && !LOGGING_ENABLED) return;
                        if (data !== undefined) {
                                console.log(`${prefix} ${message}`, data);
                        } else {
                                console.log(`${prefix} ${message}`);
                        }
                },
                warn(message: string, data?: unknown) {
                        if (!DEBUG_ENABLED && !LOGGING_ENABLED) return;
                        if (data !== undefined) {
                                console.warn(`${prefix} ${message}`, data);
                        } else {
                                console.warn(`${prefix} ${message}`);
                        }
                },
                error(message: string, data?: unknown) {
                        if (data !== undefined) {
                                console.error(`${prefix} ${message}`, data);
                        } else {
                                console.error(`${prefix} ${message}`);
                        }
                },
        };
}
