/**
 * Model Configuration Map
 *
 * Maps model config IDs to their normalized API model names.
 * Only includes exact config IDs that OpenCode will pass to the plugin.
 */

/**
 * Map of config model IDs to normalized API model names
 *
 * Key: The model ID as specified in opencode.json config
 * Value: The normalized model name to send to the API
 */
export const MODEL_MAP: Record<string, string> = {
// ============================================================================
// GPT-5.1 Codex Models
// ============================================================================
	"gpt-5.1-codex": "gpt-5.1-codex",
	"gpt-5.1-codex-low": "gpt-5.1-codex",
	"gpt-5.1-codex-medium": "gpt-5.1-codex",
	"gpt-5.1-codex-high": "gpt-5.1-codex",

	// ============================================================================
	// GPT-5.1 Codex Max Models
	// ============================================================================
	"gpt-5.1-codex-max": "gpt-5.1-codex-max",
	"gpt-5.1-codex-max-low": "gpt-5.1-codex-max",
	"gpt-5.1-codex-max-medium": "gpt-5.1-codex-max",
	"gpt-5.1-codex-max-high": "gpt-5.1-codex-max",
	"gpt-5.1-codex-max-xhigh": "gpt-5.1-codex-max",

	// ============================================================================
	// GPT-5.2 Models (supports none/low/medium/high/xhigh per OpenAI API docs)
	// ============================================================================
	"gpt-5.2": "gpt-5.2",
	"gpt-5.2-none": "gpt-5.2",
	"gpt-5.2-low": "gpt-5.2",
	"gpt-5.2-medium": "gpt-5.2",
	"gpt-5.2-high": "gpt-5.2",
	"gpt-5.2-xhigh": "gpt-5.2",

	// ============================================================================
	// GPT-5.1 Codex Mini Models
	// ============================================================================
	"gpt-5.1-codex-mini": "gpt-5.1-codex-mini",
	"gpt-5.1-codex-mini-medium": "gpt-5.1-codex-mini",
	"gpt-5.1-codex-mini-high": "gpt-5.1-codex-mini",

	// ============================================================================
	// GPT-5.1 General Purpose Models (supports none/low/medium/high per OpenAI API docs)
	// ============================================================================
	"gpt-5.1": "gpt-5.1",
	"gpt-5.1-none": "gpt-5.1",
	"gpt-5.1-low": "gpt-5.1",
	"gpt-5.1-medium": "gpt-5.1",
	"gpt-5.1-high": "gpt-5.1",
	"gpt-5.1-chat-latest": "gpt-5.1",

	// ============================================================================
	// GPT-5 Codex Models (LEGACY - maps to gpt-5.1-codex as gpt-5 is being phased out)
	// ============================================================================
	"gpt-5-codex": "gpt-5.1-codex",

	// ============================================================================
	// GPT-5 Codex Mini Models (LEGACY - maps to gpt-5.1-codex-mini)
	// ============================================================================
	"codex-mini-latest": "gpt-5.1-codex-mini",
	"gpt-5-codex-mini": "gpt-5.1-codex-mini",
	"gpt-5-codex-mini-medium": "gpt-5.1-codex-mini",
	"gpt-5-codex-mini-high": "gpt-5.1-codex-mini",

	// ============================================================================
	// GPT-5 General Purpose Models (LEGACY - maps to gpt-5.1 as gpt-5 is being phased out)
	// ============================================================================
	"gpt-5": "gpt-5.1",
	"gpt-5-mini": "gpt-5.1",
	"gpt-5-nano": "gpt-5.1",
};

/**
 * Get normalized model name from config ID
 *
 * @param modelId - Model ID from config (e.g., "gpt-5.1-codex-low")
 * @returns Normalized model name (e.g., "gpt-5.1-codex") or undefined if not found
 */
export function getNormalizedModel(modelId: string): string | undefined {
	try {
		// Try direct lookup first
		if (MODEL_MAP[modelId]) {
			return MODEL_MAP[modelId];
		}

		// Try case-insensitive lookup
		const lowerModelId = modelId.toLowerCase();
		const match = Object.keys(MODEL_MAP).find(
			(key) => key.toLowerCase() === lowerModelId,
		);

		return match ? MODEL_MAP[match] : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Check if a model ID is in the model map
 *
 * @param modelId - Model ID to check
 * @returns True if model is in the map
 */
export function isKnownModel(modelId: string): boolean {
	return getNormalizedModel(modelId) !== undefined;
}
