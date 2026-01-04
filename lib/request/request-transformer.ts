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
  if (!model) return "gpt-5.1";

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
  // 1. GPT-5.2 Codex (newest codex model)
  if (
    normalized.includes("gpt-5.2-codex") ||
    normalized.includes("gpt 5.2 codex")
  ) {
    return "gpt-5.2-codex";
  }

  // 2. GPT-5.2 (general purpose)
  if (normalized.includes("gpt-5.2") || normalized.includes("gpt 5.2")) {
    return "gpt-5.2";
  }

  // 3. GPT-5.1 Codex Max
  if (
    normalized.includes("gpt-5.1-codex-max") ||
    normalized.includes("gpt 5.1 codex max")
  ) {
    return "gpt-5.1-codex-max";
  }

  // 4. GPT-5.1 Codex Mini
  if (
    normalized.includes("gpt-5.1-codex-mini") ||
    normalized.includes("gpt 5.1 codex mini")
  ) {
    return "gpt-5.1-codex-mini";
  }

  // 5. Legacy Codex Mini
  if (
    normalized.includes("codex-mini-latest") ||
    normalized.includes("gpt-5-codex-mini") ||
    normalized.includes("gpt 5 codex mini")
  ) {
    return "codex-mini-latest";
  }

  // 6. GPT-5.1 Codex
  if (
    normalized.includes("gpt-5.1-codex") ||
    normalized.includes("gpt 5.1 codex")
  ) {
    return "gpt-5.1-codex";
  }

  // 7. GPT-5.1 (general-purpose)
  if (normalized.includes("gpt-5.1") || normalized.includes("gpt 5.1")) {
    return "gpt-5.1";
  }

  // 8. GPT-5 Codex family (any variant with "codex")
  if (normalized.includes("codex")) {
    return "gpt-5.1-codex";
  }

  // 9. GPT-5 family (any variant) - default to 5.1 as 5 is being phased out
  if (normalized.includes("gpt-5") || normalized.includes("gpt 5")) {
    return "gpt-5.1";
  }

  // Default fallback - use gpt-5.1 as gpt-5 is being phased out
  return "gpt-5.1";
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
 * @param userConfig - User configuration from plugin config file
 * @param externalConfig - External configuration from OpenCode's providerOptions (variant selection)
 * @returns Reasoning configuration
 */
export function getReasoningConfig(
  modelName: string | undefined,
  userConfig: ConfigOptions = {},
  externalConfig: ConfigOptions = {},
): ReasoningConfig {
  const normalizedName = modelName?.toLowerCase() ?? "";

  // GPT-5.2 Codex is the newest codex model (supports xhigh, but not "none")
  const isGpt52Codex =
    normalizedName.includes("gpt-5.2-codex") ||
    normalizedName.includes("gpt 5.2 codex");

  // GPT-5.2 general purpose (not codex variant)
  const isGpt52General =
    (normalizedName.includes("gpt-5.2") ||
      normalizedName.includes("gpt 5.2")) &&
    !isGpt52Codex;
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
    (normalizedName.includes("nano") || normalizedName.includes("mini"));

  // GPT-5.1 general purpose (not codex variants) - supports "none" per OpenAI API docs
  const isGpt51General =
    (normalizedName.includes("gpt-5.1") ||
      normalizedName.includes("gpt 5.1")) &&
    !isCodex &&
    !isCodexMax &&
    !isCodexMini;

  // GPT 5.2, GPT 5.2 Codex, and Codex Max support xhigh reasoning
  const supportsXhigh = isGpt52General || isGpt52Codex || isCodexMax;

  // GPT 5.1 general and GPT 5.2 general support "none" reasoning per:
  // - OpenAI API docs: "gpt-5.1 defaults to none, supports: none, low, medium, high"
  // - Codex CLI: ReasoningEffort enum includes None variant (codex-rs/protocol/src/openai_models.rs)
  // - Codex CLI: docs/config.md lists "none" as valid for model_reasoning_effort
  // - gpt-5.2 (being newer) also supports: none, low, medium, high, xhigh
  // - Codex models (including GPT-5.2 Codex) do NOT support "none"
  const supportsNone = isGpt52General || isGpt51General;

  // Default based on model type (Codex CLI defaults)
  // Note: OpenAI docs say gpt-5.1 defaults to "none", but we default to "medium"
  // for better coding assistance unless user explicitly requests "none"
  const defaultEffort: ReasoningConfig["effort"] = isCodexMini
    ? "medium"
    : supportsXhigh
      ? "high"
      : isLightweight
        ? "minimal"
        : "medium";

  // Priority: externalConfig (from OpenCode variant) > userConfig > computed defaults
  // This allows variant selection via Ctrl+T to override plugin defaults
  let effort =
    externalConfig.reasoningEffort ??
    userConfig.reasoningEffort ??
    defaultEffort;

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

  // For models that don't support xhigh, downgrade to high
  if (!supportsXhigh && effort === "xhigh") {
    effort = "high";
  }

  // For models that don't support "none", upgrade to "low"
  // (Codex models don't support "none" - only GPT-5.1 and GPT-5.2 general purpose do)
  if (!supportsNone && effort === "none") {
    effort = "low";
  }

  // Normalize "minimal" to "low" for ALL GPT-5.1/5.2 models
  // "minimal" is NOT supported by any gpt-5.1 or gpt-5.2 model (general or codex)
  // It was deprecated when transitioning from gpt-5 to gpt-5.1
  if (effort === "minimal") {
    effort = "low";
  }

  // Priority for summary: externalConfig > userConfig > "auto" (Codex CLI default)
  const summary =
    externalConfig.reasoningSummary ?? userConfig.reasoningSummary ?? "auto";

  return {
    effort,
    summary,
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
 * Extract content text from an input item
 * @param item - Input item
 * @returns Content as string
 */
function getContentText(item: InputItem): string {
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
}

/**
 * Extract AGENTS.md content from a concatenated OpenCode message
 *
 * OpenCode concatenates multiple pieces into a single developer message:
 * 1. Base codex.txt prompt (starts with "You are a coding agent running in...")
 * 2. Environment info
 * 3. <files> block
 * 4. AGENTS.md content (prefixed with "Instructions from: /path/to/AGENTS.md")
 *
 * This function extracts the AGENTS.md portions so they can be preserved
 * when filtering out the OpenCode base prompt.
 *
 * @param contentText - The full content text of the message
 * @returns The AGENTS.md content if found, null otherwise
 */
function extractAgentsMdContent(contentText: string): string | null {
	const marker = "Instructions from:";
	const idx = contentText.indexOf(marker);
	if (idx > 0) {
		return contentText.slice(idx).trimStart();
	}
	return null;
}

/**
 * Filter out OpenCode system prompts from input
 * Used in CODEX_MODE to replace OpenCode prompts with Codex-OpenCode bridge
 *
 * When OpenCode sends a concatenated message containing both the base prompt
 * AND AGENTS.md content, this function extracts and preserves the AGENTS.md
 * portions while filtering out the OpenCode base prompt.
 *
 * @param input - Input array
 * @returns Input array without OpenCode system prompts (but with AGENTS.md preserved)
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

  const result: InputItem[] = [];

  for (const item of input) {
    // Keep user messages as-is
    if (item.role === "user") {
      result.push(item);
      continue;
    }

    // Check if this is an OpenCode system prompt
    if (isOpenCodeSystemPrompt(item, cachedPrompt)) {
      // OpenCode may concatenate AGENTS.md content with the base prompt
      // Extract and preserve any AGENTS.md content
      const contentText = getContentText(item);
      const agentsMdContent = extractAgentsMdContent(contentText);

      if (agentsMdContent) {
        // Create a new message with just the AGENTS.md content
        result.push({
          type: "message",
          role: "developer",
          content: agentsMdContent,
        });
      }
      // Filter out the OpenCode base prompt (don't add original item)
      continue;
    }

    // Keep all other messages
    result.push(item);
  }

  return result;
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
 * Validate and normalize reasoning effort based on model-specific constraints
 * This is used when the AI SDK already provides a reasoning effort from variant selection,
 * but we need to ensure it's valid for the specific model (e.g., downgrade xhigh to high)
 *
 * @param effort - The reasoning effort to validate
 * @param modelName - The normalized model name
 * @returns Validated effort with model-specific fixes applied
 */
function validateReasoningEffort(
  effort: string,
  modelName: string,
): ReasoningConfig["effort"] {
  const normalizedName = modelName.toLowerCase();
  const isCodexMini = normalizedName.includes("codex-mini");
  const isCodex = normalizedName.includes("codex") && !isCodexMini;
  const supportsXhigh =
    normalizedName.includes("gpt-5.2") || normalizedName.includes("codex-max");
  const supportsNone =
    (normalizedName.includes("gpt-5.2") ||
      normalizedName.includes("gpt-5.1")) &&
    !isCodex;

  let result = effort as ReasoningConfig["effort"];

  // Codex Mini only supports medium and high
  if (isCodexMini) {
    if (result === "none" || result === "minimal" || result === "low") {
      result = "medium";
    } else if (result === "xhigh") {
      result = "high";
    } else if (result !== "high" && result !== "medium") {
      result = "medium";
    }
  }

  // For models that don't support xhigh, downgrade to high
  if (!supportsXhigh && result === "xhigh") {
    result = "high";
  }

  // For models that don't support "none", upgrade to "low"
  if (!supportsNone && result === "none") {
    result = "low";
  }

  // Normalize "minimal" to "low" for ALL GPT-5.1/5.2 models
  // "minimal" is NOT supported by any gpt-5.1 or gpt-5.2 model (general or codex)
  // It was deprecated when transitioning from gpt-5 to gpt-5.1
  if (result === "minimal") {
    result = "low";
  }

  return result;
}

/**
 * Transform request body for Codex API
 *
 * NOTE: Configuration follows Codex CLI patterns instead of opencode defaults:
 * - opencode sets textVerbosity="low" for gpt-5, but Codex CLI uses "medium"
 * - opencode excludes gpt-5-codex from reasoning configuration
 * - This plugin uses store=false (stateless), requiring encrypted reasoning content
 *
 * VARIANT SELECTION FLOW:
 * - When user selects a reasoning variant via Ctrl+T or --model=openai/gpt-5.2:high,
 *   OpenCode passes this through the AI SDK which sets body.reasoning.effort/summary
 * - We check if body.reasoning already exists (from AI SDK/variant selection)
 * - If yes, we RESPECT it (don't override user's variant selection)
 * - If no, we apply plugin computed defaults
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
  // Always set stream=true for API - response handling detects original intent
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

    // Handle orphaned function_call_output items (where function_call was an item_reference that got filtered)
    // Instead of removing orphans (which causes infinite loops as LLM loses tool results),
    // convert them to messages to preserve context while avoiding API errors
    if (body.input) {
      const functionCallIds = new Set(
        body.input
          .filter((item) => item.type === "function_call" && item.call_id)
          .map((item) => item.call_id),
      );
      body.input = body.input.map((item) => {
        if (
          item.type === "function_call_output" &&
          !functionCallIds.has(item.call_id)
        ) {
          const toolName =
            typeof (item as any).name === "string"
              ? (item as any).name
              : "tool";
          const callId = (item as any).call_id ?? "";
          let text: string;
          try {
            const out = (item as any).output;
            text = typeof out === "string" ? out : JSON.stringify(out);
          } catch {
            text = String((item as any).output ?? "");
          }
          if (text.length > 16000) {
            text = text.slice(0, 16000) + "\n...[truncated]";
          }
          return {
            type: "message",
            role: "assistant",
            content: `[Previous ${toolName} result; call_id=${callId}]: ${text}`,
          } as InputItem;
        }
        return item;
      });
    }
  }

  // Check if reasoning config is already set by AI SDK (from Ctrl+T variant selection)
  // or by providerOptions (legacy/opencode variant config)
  // Priority: body.reasoning > providerOptions > user config > plugin defaults
  const existingEffort =
    body.reasoning?.effort ?? body.providerOptions?.openai?.reasoningEffort;
  const existingSummary =
    body.reasoning?.summary ?? body.providerOptions?.openai?.reasoningSummary;

  logDebug("Checking for existing reasoning config from AI SDK/variant", {
    existingEffort,
    existingSummary,
    fromBodyReasoning: !!body.reasoning?.effort,
    fromProviderOptions: !!body.providerOptions?.openai?.reasoningEffort,
    normalizedModel,
  });

  // If AI SDK or providerOptions already set reasoning config, respect it
  // but validate it against model-specific constraints (e.g., xhigh → high for non-supporting models)
  if (existingEffort) {
    logDebug("Respected existing reasoning effort from AI SDK/variant", {
      effort: existingEffort,
    });

    // Validate and fix the existing effort for model-specific constraints
    const validatedEffort = validateReasoningEffort(
      existingEffort,
      normalizedModel,
    );

    body.reasoning = {
      ...body.reasoning,
      effort: validatedEffort,
      summary: existingSummary ?? "auto",
    };
    logDebug("Validated existing reasoning config for model constraints", {
      original: existingEffort,
      validated: validatedEffort,
    });
  } else {
    // No existing config, apply plugin computed defaults
    const reasoningConfig = getReasoningConfig(normalizedModel, modelConfig);
    body.reasoning = {
      ...body.reasoning,
      ...reasoningConfig,
    };
    logDebug("Applied plugin computed reasoning config", body.reasoning);
  }

  // Configure text verbosity
  // Priority: body.text.verbosity > providerOptions.textVerbosity > user config > plugin default
  const existingTextVerbosity =
    body.text?.verbosity ?? body.providerOptions?.openai?.textVerbosity;
  body.text = {
    ...body.text,
    verbosity: existingTextVerbosity ?? modelConfig.textVerbosity ?? "medium",
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
