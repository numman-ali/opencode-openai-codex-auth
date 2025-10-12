import { TOOL_REMAP_MESSAGE } from "../prompts/codex.js";
import { CODEX_OPENCODE_BRIDGE } from "../prompts/codex-opencode-bridge.js";
import { getOpenCodeCodexPrompt } from "../prompts/opencode-codex.js";
import type {
	UserConfig,
	ConfigOptions,
	ReasoningConfig,
	RequestBody,
	InputItem,
} from "../types.js";

/**
 * Normalize model name to Codex-supported variants
 * @param model - Original model name
 * @returns Normalized model name
 */
export function normalizeModel(model: string | undefined): string {
	if (!model) return "gpt-5";

	if (model.includes("codex")) {
		return "gpt-5-codex";
	}
	if (model.includes("gpt-5")) {
		return "gpt-5";
	}

	return "gpt-5"; // Default fallback
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
	originalModel: string | undefined,
	userConfig: ConfigOptions = {},
): ReasoningConfig {
	const isLightweight =
		originalModel?.includes("nano") || originalModel?.includes("mini");
	const isCodex = originalModel?.includes("codex");

	// Default based on model type (Codex CLI defaults)
	const defaultEffort: "minimal" | "low" | "medium" | "high" = isLightweight
		? "minimal"
		: "medium";

	// Get user-requested effort
	let effort = userConfig.reasoningEffort || defaultEffort;

	// Normalize "minimal" to "low" for gpt-5-codex
	// Codex CLI does not provide a "minimal" preset for gpt-5-codex
	// (only low/medium/high - see model_presets.rs:20-40)
	if (isCodex && effort === "minimal") {
		effort = "low";
	}

	return {
		effort,
		summary: userConfig.reasoningSummary || "auto", // Changed from "detailed" to match Codex CLI
	};
}

/**
 * Filter input array to remove stored conversation history references
 * @param input - Original input array
 * @returns Filtered input array
 */
export function filterInput(
  input: InputItem[] | undefined,
): InputItem[] | undefined {
  if (!Array.isArray(input)) return input;

  return input
    .filter((item) => item.type !== "item_reference")
    .map(({ id, ...rest }) => rest);
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

	// Get model-specific configuration (merges global + per-model options)
	const modelConfig = getModelConfig(normalizedModel, userConfig);

	// Normalize model name
	body.model = normalizedModel;

	// Codex required fields
	body.store = false;
	body.stream = true;
	body.instructions = codexInstructions;

	// Filter and transform input
	if (body.input && Array.isArray(body.input)) {
		body.input = filterInput(body.input);

		if (codexMode) {
			// CODEX_MODE: Remove OpenCode system prompt, add bridge prompt
			body.input = await filterOpenCodeSystemPrompts(body.input);
			body.input = addCodexBridgeMessage(body.input, !!body.tools);
		} else {
			// DEFAULT MODE: Keep original behavior with tool remap message
			body.input = addToolRemapMessage(body.input, !!body.tools);
		}
	}

	// Configure reasoning (use model-specific config)
	const reasoningConfig = getReasoningConfig(originalModel, modelConfig);
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
