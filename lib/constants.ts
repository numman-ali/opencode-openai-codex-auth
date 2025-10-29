/**
 * Constants used throughout the plugin
 * Centralized for easy maintenance and configuration
 */

/** Plugin identifier for logging and error messages */
export const PLUGIN_NAME = "openai-codex-plugin";

/** Base URL for ChatGPT backend API */
export const CODEX_BASE_URL = "https://chatgpt.com/backend-api";

/** Dummy API key used for OpenAI SDK (actual auth via OAuth) */
export const DUMMY_API_KEY = "chatgpt-oauth";

/** Provider ID for opencode configuration */
export const PROVIDER_ID = "openai";

/** HTTP Status Codes */
export const HTTP_STATUS = {
	OK: 200,
	UNAUTHORIZED: 401,
} as const;

/** OpenAI-specific headers */
export const OPENAI_HEADERS = {
	BETA: "OpenAI-Beta",
	ACCOUNT_ID: "chatgpt-account-id",
	ORIGINATOR: "originator",
	SESSION_ID: "session_id",
	CONVERSATION_ID: "conversation_id",
} as const;

/** OpenAI-specific header values */
export const OPENAI_HEADER_VALUES = {
	BETA_RESPONSES: "responses=experimental",
	ORIGINATOR_CODEX: "codex_cli_rs",
} as const;

/** URL path segments */
export const URL_PATHS = {
	RESPONSES: "/responses",
	CODEX_RESPONSES: "/codex/responses",
} as const;

/** JWT claim path for ChatGPT account ID */
export const JWT_CLAIM_PATH = "https://api.openai.com/auth" as const;

/** Error messages */
export const ERROR_MESSAGES = {
	NO_ACCOUNT_ID: "Failed to extract accountId from token",
	TOKEN_REFRESH_FAILED: "Failed to refresh token, authentication required",
	REQUEST_PARSE_ERROR: "Error parsing request",
} as const;

/** Log stages for request logging */
export const LOG_STAGES = {
	BEFORE_TRANSFORM: "before-transform",
	AFTER_TRANSFORM: "after-transform",
	RESPONSE: "response",
	ERROR_RESPONSE: "error-response",
} as const;

/** Platform-specific browser opener commands */
export const PLATFORM_OPENERS = {
	darwin: "open",
	win32: "start",
	linux: "xdg-open",
} as const;

/** OAuth authorization labels */
export const AUTH_LABELS = {
	OAUTH: "ChatGPT Plus/Pro (Codex Subscription)",
	API_KEY: "Manually enter API Key",
	INSTRUCTIONS: "A browser window should open. Complete login to finish.",
} as const;
