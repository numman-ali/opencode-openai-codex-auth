import { logDebug, logWarn } from "../logger.js";
import { TOOL_REMAP_MESSAGE } from "../prompts/codex.js";
import { CODEX_OPENCODE_BRIDGE } from "../prompts/codex-opencode-bridge.js";
import { getOpenCodeCodexPrompt } from "../prompts/opencode-codex.js";
import { getNormalizedModel } from "./helpers/model-map.js";
import type {
	ConfigOptions,
	InputItem,
	ReasoningConfig,
	RequestBody,
	UserConfig,
} from "../types.js";

/**
 * Normalize model name to Codex-supported variants
 *
 * Uses explicit model map for known models, with fallback pattern matching
 * for unknown/custom model names.
 *
 * @param model - Original model name (e.g., "gpt-5.1-codex-low", "openai/gpt-5-codex")
 * @returns Normalized model name (e.g., "gpt-5.1-codex", "gpt-5-codex")
 */
export function normalizeModel(model: string | undefined): string {
	if (!model) return "gpt-5";

	// Strip provider prefix if present (e.g., "openai/gpt-5-codex" → "gpt-5-codex")
	const modelId = model.includes("/") ? model.split("/").pop()! : model;

	// Try explicit model map first (handles all known model variants)
	const mappedModel = getNormalizedModel(modelId);
	if (mappedModel) {
		return mappedModel;
	}

	// Fallback: Pattern-based matching for unknown/custom model names
	// This preserves backwards compatibility with old verbose names
	// like "GPT 5 Codex Low (ChatGPT Subscription)"
	const normalized = modelId.toLowerCase();

	// Priority order for pattern matching (most specific first):
	// 1. GPT-5.1 Codex Max
	if (
		normalized.includes("gpt-5.1-codex-max") ||
		normalized.includes("gpt 5.1 codex max")
	) {
		return "gpt-5.1-codex-max";
	}

	// 2. GPT-5.1 Codex Mini
	if (
		normalized.includes("gpt-5.1-codex-mini") ||
		normalized.includes("gpt 5.1 codex mini")
	) {
		return "gpt-5.1-codex-mini";
	}

	// 3. Legacy Codex Mini
	if (
		normalized.includes("codex-mini-latest") ||
		normalized.includes("gpt-5-codex-mini") ||
		normalized.includes("gpt 5 codex mini")
	) {
		return "codex-mini-latest";
	}

	// 4. GPT-5.1 Codex
	if (
		normalized.includes("gpt-5.1-codex") ||
		normalized.includes("gpt 5.1 codex")
	) {
		return "gpt-5.1-codex";
	}

	// 5. GPT-5.1 (general-purpose)
	if (normalized.includes("gpt-5.1") || normalized.includes("gpt 5.1")) {
		return "gpt-5.1";
	}

	// 6. GPT-5 Codex family (any variant with "codex")
	if (normalized.includes("codex")) {
		return "gpt-5-codex";
	}

	// 7. GPT-5 family (any variant)
	if (normalized.includes("gpt-5") || normalized.includes("gpt 5")) {
		return "gpt-5";
	}

	// Default fallback
	return "gpt-5";
}

/**
 * Extract configuration for a specific model
 * Merges global options with model-specific options (model-specific takes precedence)
 * @param modelName - Model name (e.g., "gpt-5-codex")
 * @param userConfig - Full user configuration object
 * @returns Merged configuration for this model
 */
export function getModelConfig(
	modelName: string,
	userConfig: UserConfig = { global: {}, models: {} },
): ConfigOptions {
	const globalOptions = userConfig.global || {};
	const modelOptions = userConfig.models?.[modelName]?.options || {};

	// Model-specific options override global options
	return { ...globalOptions, ...modelOptions };
}

/**
 * Configure reasoning parameters based on model variant and user config
 *
 * NOTE: This plugin follows Codex CLI defaults instead of opencode defaults because:
 * - We're accessing the ChatGPT backend API (not OpenAI Platform API)
 * - opencode explicitly excludes gpt-5-codex from automatic reasoning configuration
 * - Codex CLI has been thoroughly tested against this backend
 *
 * @param originalModel - Original model name before normalization
 * @param userConfig - User configuration object
 * @returns Reasoning configuration
 */
export function getReasoningConfig(
	modelName: string | undefined,
	userConfig: ConfigOptions = {},
): ReasoningConfig {
	const normalizedName = modelName?.toLowerCase() ?? "";
	const isCodexMax =
		normalizedName.includes("codex-max") ||
		normalizedName.includes("codex max");
	const isCodexMini =
		normalizedName.includes("codex-mini") ||
		normalizedName.includes("codex mini") ||
		normalizedName.includes("codex_mini") ||
		normalizedName.includes("codex-mini-latest");
	const isCodex = normalizedName.includes("codex") && !isCodexMini;
	const isLightweight =
		!isCodexMini &&
		(normalizedName.includes("nano") ||
			normalizedName.includes("mini"));

	// Default based on model type (Codex CLI defaults)
	const defaultEffort: ReasoningConfig["effort"] = isCodexMini
		? "medium"
		: isCodexMax
			? "high"
			: isLightweight
				? "minimal"
				: "medium";

	// Get user-requested effort
	let effort = userConfig.reasoningEffort || defaultEffort;

	if (isCodexMini) {
		if (effort === "minimal" || effort === "low" || effort === "none") {
			effort = "medium";
		}
		if (effort === "xhigh") {
			effort = "high";
		}
		if (effort !== "high" && effort !== "medium") {
			effort = "medium";
		}
	}

	// For all non-Codex-Max models, downgrade unsupported xhigh to high
	if (!isCodexMax && effort === "xhigh") {
		effort = "high";
	}

	// Normalize "minimal" to "low" for Codex families
	// Codex CLI presets are low/medium/high (or xhigh for Codex Max)
	if (isCodex && effort === "minimal") {
		effort = "low";
	}

	return {
		effort,
		summary: userConfig.reasoningSummary || "auto", // Changed from "detailed" to match Codex CLI
	};
}

/**
 * Filter input array for stateless Codex API (store: false)
 *
 * Two transformations needed:
 * 1. Remove AI SDK-specific items (not supported by Codex API)
 * 2. Strip IDs from all remaining items (stateless mode)
 *
 * AI SDK constructs to REMOVE (not in OpenAI Responses API spec):
 * - type: "item_reference" - AI SDK uses this for server-side state lookup
 *
 * Items to KEEP (strip IDs):
 * - type: "message" - Conversation messages (provides context to LLM)
 * - type: "function_call" - Tool calls from conversation
 * - type: "function_call_output" - Tool results from conversation
 *
 * Context is maintained through:
 * - Full message history (without IDs)
 * - reasoning.encrypted_content (for reasoning continuity)
 *
 * @param input - Original input array from OpenCode/AI SDK
 * @returns Filtered input array compatible with Codex API
 */
export function filterInput(
	input: InputItem[] | undefined,
): InputItem[] | undefined {
	if (!Array.isArray(input)) return input;

	return input
		.filter((item) => {
			// Remove AI SDK constructs not supported by Codex API
			if (item.type === "item_reference") {
				return false; // AI SDK only - references server state
			}
			return true; // Keep all other items
		})
		.map((item) => {
			// Strip IDs from all items (Codex API stateless mode)
			if (item.id) {
				const { id, ...itemWithoutId } = item;
				return itemWithoutId as InputItem;
			}
			return item;
		});
}

/**
 * Check if an input item is the OpenCode system prompt
 * Uses cached OpenCode codex.txt for verification with fallback to text matching
 * @param item - Input item to check
 * @param cachedPrompt - Cached OpenCode codex.txt content
 * @returns True if this is the OpenCode system prompt
 */
export function isOpenCodeSystemPrompt(
	item: InputItem,
	cachedPrompt: string | null,
): boolean {
	const isSystemRole = item.role === "developer" || item.role === "system";
	if (!isSystemRole) return false;

	const getContentText = (item: InputItem): string => {
		if (typeof item.content === "string") {
			return item.content;
		}
		if (Array.isArray(item.content)) {
			return item.content
				.filter((c) => c.type === "input_text" && c.text)
				.map((c) => c.text)
				.join("\n");
		}
		return "";
	};

	const contentText = getContentText(item);
	if (!contentText) return false;

	// Primary check: Compare against cached OpenCode prompt
	if (cachedPrompt) {
		// Exact match (trim whitespace for comparison)
		if (contentText.trim() === cachedPrompt.trim()) {
			return true;
		}

		// Partial match: Check if first 200 chars match (handles minor variations)
		const contentPrefix = contentText.trim().substring(0, 200);
		const cachedPrefix = cachedPrompt.trim().substring(0, 200);
		if (contentPrefix === cachedPrefix) {
			return true;
		}
	}

	// Fallback check: Known OpenCode prompt signature (for safety)
	// This catches the prompt even if cache fails
	return contentText.startsWith("You are a coding agent running in");
}

/**
 * Filter out OpenCode system prompts from input
 * Used in CODEX_MODE to replace OpenCode prompts with Codex-OpenCode bridge
 * @param input - Input array
 * @returns Input array without OpenCode system prompts
 */
export async function filterOpenCodeSystemPrompts(
	input: InputItem[] | undefined,
): Promise<InputItem[] | undefined> {
	if (!Array.isArray(input)) return input;

	// Fetch cached OpenCode prompt for verification
	let cachedPrompt: string | null = null;
	try {
		cachedPrompt = await getOpenCodeCodexPrompt();
	} catch {
		// If fetch fails, fallback to text-based detection only
		// This is safe because we still have the "starts with" check
	}

	return input.filter((item) => {
		// Keep user messages
		if (item.role === "user") return true;
		// Filter out OpenCode system prompts
		return !isOpenCodeSystemPrompt(item, cachedPrompt);
	});
}

/**
 * Add Codex-OpenCode bridge message to input if tools are present
 * @param input - Input array
 * @param hasTools - Whether tools are present in request
 * @returns Input array with bridge message prepended if needed
 */
export function addCodexBridgeMessage(
	input: InputItem[] | undefined,
	hasTools: boolean,
): InputItem[] | undefined {
	if (!hasTools || !Array.isArray(input)) return input;

	const bridgeMessage: InputItem = {
		type: "message",
		role: "developer",
		content: [
			{
				type: "input_text",
				text: CODEX_OPENCODE_BRIDGE,
			},
		],
	};

	return [bridgeMessage, ...input];
}

/**
 * Add tool remapping message to input if tools are present
 * @param input - Input array
 * @param hasTools - Whether tools are present in request
 * @returns Input array with tool remap message prepended if needed
 */
export function addToolRemapMessage(
	input: InputItem[] | undefined,
	hasTools: boolean,
): InputItem[] | undefined {
	if (!hasTools || !Array.isArray(input)) return input;

	const toolRemapMessage: InputItem = {
		type: "message",
		role: "developer",
		content: [
			{
				type: "input_text",
				text: TOOL_REMAP_MESSAGE,
			},
		],
	};

	return [toolRemapMessage, ...input];
}

/**
 * Transform request body for Codex API
 *
 * NOTE: Configuration follows Codex CLI patterns instead of opencode defaults:
 * - opencode sets textVerbosity="low" for gpt-5, but Codex CLI uses "medium"
 * - opencode excludes gpt-5-codex from reasoning configuration
 * - This plugin uses store=false (stateless), requiring encrypted reasoning content
 *
 * @param body - Original request body
 * @param codexInstructions - Codex system instructions
 * @param userConfig - User configuration from loader
 * @param codexMode - Enable CODEX_MODE (bridge prompt instead of tool remap) - defaults to true
 * @returns Transformed request body
 */
export async function transformRequestBody(
	body: RequestBody,
	codexInstructions: string,
	userConfig: UserConfig = { global: {}, models: {} },
	codexMode = true,
): Promise<RequestBody> {
	const originalModel = body.model;
	const normalizedModel = normalizeModel(body.model);

	// Get model-specific configuration using ORIGINAL model name (config key)
	// This allows per-model options like "gpt-5-codex-low" to work correctly
	const lookupModel = originalModel || normalizedModel;
	const modelConfig = getModelConfig(lookupModel, userConfig);

	// Debug: Log which config was resolved
	logDebug(
		`Model config lookup: "${lookupModel}" → normalized to "${normalizedModel}" for API`,
		{
			hasModelSpecificConfig: !!userConfig.models?.[lookupModel],
			resolvedConfig: modelConfig,
		},
	);

	// Normalize model name for API call
	body.model = normalizedModel;

	// Codex required fields
	// ChatGPT backend REQUIRES store=false (confirmed via testing)
	body.store = false;
	body.stream = true;
	body.instructions = codexInstructions;

	// Prompt caching relies on the host providing a stable prompt_cache_key
	// (OpenCode passes its session identifier). We no longer synthesize one here.

	// Filter and transform input
	if (body.input && Array.isArray(body.input)) {
		// Debug: Log original input message IDs before filtering
		const originalIds = body.input
			.filter((item) => item.id)
			.map((item) => item.id);
		if (originalIds.length > 0) {
			logDebug(
				`Filtering ${originalIds.length} message IDs from input:`,
				originalIds,
			);
		}

		body.input = filterInput(body.input);

		// Debug: Verify all IDs were removed
		const remainingIds = (body.input || [])
			.filter((item) => item.id)
			.map((item) => item.id);
		if (remainingIds.length > 0) {
			logWarn(
				`WARNING: ${remainingIds.length} IDs still present after filtering:`,
				remainingIds,
			);
		} else if (originalIds.length > 0) {
			logDebug(`Successfully removed all ${originalIds.length} message IDs`);
		}

		if (codexMode) {
			// CODEX_MODE: Remove OpenCode system prompt, add bridge prompt
			body.input = await filterOpenCodeSystemPrompts(body.input);
			body.input = addCodexBridgeMessage(body.input, !!body.tools);
		} else {
			// DEFAULT MODE: Keep original behavior with tool remap message
			body.input = addToolRemapMessage(body.input, !!body.tools);
		}
	}

	// Configure reasoning (use normalized model family + model-specific config)
	const reasoningConfig = getReasoningConfig(normalizedModel, modelConfig);
	body.reasoning = {
		...body.reasoning,
		...reasoningConfig,
	};

	// Configure text verbosity (support user config)
	// Default: "medium" (matches Codex CLI default for all GPT-5 models)
	body.text = {
		...body.text,
		verbosity: modelConfig.textVerbosity || "medium",
	};

	// Add include for encrypted reasoning content
	// Default: ["reasoning.encrypted_content"] (required for stateless operation with store=false)
	// This allows reasoning context to persist across turns without server-side storage
	body.include = modelConfig.include || ["reasoning.encrypted_content"];

	// Remove unsupported parameters
	body.max_output_tokens = undefined;
	body.max_completion_tokens = undefined;

	return body;
}
