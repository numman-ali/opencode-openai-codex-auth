import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CacheMetadata, GitHubRelease } from "../types.js";

const GITHUB_API_RELEASES =
	"https://api.github.com/repos/openai/codex/releases/latest";
const GITHUB_HTML_RELEASES =
	"https://github.com/openai/codex/releases/latest";
const CACHE_DIR = join(homedir(), ".opencode", "cache");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Model family type for prompt selection
 * Maps to different system prompts in the Codex CLI
 */
export type ModelFamily = "gpt-5.2-codex" | "codex-max" | "codex" | "gpt-5.2" | "gpt-5.1";

/**
 * Prompt file mapping for each model family
 * Based on codex-rs/core/src/model_family.rs logic
 */
const PROMPT_FILES: Record<ModelFamily, string> = {
	"gpt-5.2-codex": "gpt-5.1-codex-max_prompt.md", // Shares prompts with codex-max
	"codex-max": "gpt-5.1-codex-max_prompt.md",
	codex: "gpt_5_codex_prompt.md",
	"gpt-5.2": "gpt-5.1-codex-max_prompt.md", // GPT 5.2 uses same prompts as codex-max
	"gpt-5.1": "gpt_5_1_prompt.md",
};

/**
 * Cache file mapping for each model family
 */
const CACHE_FILES: Record<ModelFamily, string> = {
	"gpt-5.2-codex": "gpt-5.2-codex-instructions.md",
	"codex-max": "codex-max-instructions.md",
	codex: "codex-instructions.md",
	"gpt-5.2": "gpt-5.2-instructions.md",
	"gpt-5.1": "gpt-5.1-instructions.md",
};

/**
 * Determine the model family based on the normalized model name
 * @param normalizedModel - The normalized model name (e.g., "gpt-5.2-codex", "gpt-5.1-codex-max", "gpt-5.1-codex", "gpt-5.1")
 * @returns The model family for prompt selection
 */
export function getModelFamily(normalizedModel: string): ModelFamily {
	// Order matters - check more specific patterns first
	// GPT-5.2 Codex is the newest codex model
	if (normalizedModel.includes("gpt-5.2-codex") || normalizedModel.includes("gpt 5.2 codex")) {
		return "gpt-5.2-codex";
	}
	if (normalizedModel.includes("codex-max")) {
		return "codex-max";
	}
	if (
		normalizedModel.includes("codex") ||
		normalizedModel.startsWith("codex-")
	) {
		return "codex";
	}
	if (normalizedModel.includes("gpt-5.2")) {
		return "gpt-5.2";
	}
	return "gpt-5.1";
}

/**
 * Get the latest release tag from GitHub
 * @returns Release tag name (e.g., "rust-v0.43.0")
 */
async function getLatestReleaseTag(): Promise<string> {
	try {
		const response = await fetch(GITHUB_API_RELEASES);
		if (response.ok) {
			const data = (await response.json()) as GitHubRelease;
			if (data.tag_name) {
				return data.tag_name;
			}
		}
	} catch {
	}

	const htmlResponse = await fetch(GITHUB_HTML_RELEASES);
	if (!htmlResponse.ok) {
		throw new Error(
			`Failed to fetch latest release: ${htmlResponse.status}`,
		);
	}

	const finalUrl = htmlResponse.url;
	if (finalUrl) {
		const parts = finalUrl.split("/tag/");
		const last = parts[parts.length - 1];
		if (last && !last.includes("/")) {
			return last;
		}
	}

	const html = await htmlResponse.text();
	const match = html.match(/\/openai\/codex\/releases\/tag\/([^"]+)/);
	if (match && match[1]) {
		return match[1];
	}

	throw new Error("Failed to determine latest release tag from GitHub");
}

/**
 * Fetch Codex instructions from GitHub with ETag-based caching
 * Uses HTTP conditional requests to efficiently check for updates
 * Always fetches from the latest release tag, not main branch
 *
 * Rate limit protection: Only checks GitHub if cache is older than 15 minutes
 *
 * @param normalizedModel - The normalized model name (optional, defaults to "gpt-5.1-codex" for backwards compatibility)
 * @returns Codex instructions for the specified model family
 */
export async function getCodexInstructions(
	normalizedModel = "gpt-5.1-codex",
): Promise<string> {
	const modelFamily = getModelFamily(normalizedModel);
	const promptFile = PROMPT_FILES[modelFamily];
	const cacheFile = join(CACHE_DIR, CACHE_FILES[modelFamily]);
	const cacheMetaFile = join(
		CACHE_DIR,
		`${CACHE_FILES[modelFamily].replace(".md", "-meta.json")}`,
	);

	try {
		// Load cached metadata (includes ETag, tag, and lastChecked timestamp)
		let cachedETag: string | null = null;
		let cachedTag: string | null = null;
		let cachedTimestamp: number | null = null;

		if (existsSync(cacheMetaFile)) {
			const metadata = JSON.parse(
				readFileSync(cacheMetaFile, "utf8"),
			) as CacheMetadata;
			cachedETag = metadata.etag;
			cachedTag = metadata.tag;
			cachedTimestamp = metadata.lastChecked;
		}

		// Rate limit protection: If cache is less than 15 minutes old, use it
		const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
		if (
			cachedTimestamp &&
			Date.now() - cachedTimestamp < CACHE_TTL_MS &&
			existsSync(cacheFile)
		) {
			return readFileSync(cacheFile, "utf8");
		}

		// Get the latest release tag (only if cache is stale or missing)
		const latestTag = await getLatestReleaseTag();
		const CODEX_INSTRUCTIONS_URL = `https://raw.githubusercontent.com/openai/codex/${latestTag}/codex-rs/core/${promptFile}`;

		// If tag changed, we need to fetch new instructions
		if (cachedTag !== latestTag) {
			cachedETag = null; // Force re-fetch
		}

		// Make conditional request with If-None-Match header
		const headers: Record<string, string> = {};
		if (cachedETag) {
			headers["If-None-Match"] = cachedETag;
		}

		const response = await fetch(CODEX_INSTRUCTIONS_URL, { headers });

		// 304 Not Modified - our cached version is still current
		if (response.status === 304) {
			if (existsSync(cacheFile)) {
				return readFileSync(cacheFile, "utf8");
			}
			// Cache file missing but GitHub says not modified - fall through to re-fetch
		}

		// 200 OK - new content or first fetch
		if (response.ok) {
			const instructions = await response.text();
			const newETag = response.headers.get("etag");

			// Create cache directory if it doesn't exist
			if (!existsSync(CACHE_DIR)) {
				mkdirSync(CACHE_DIR, { recursive: true });
			}

			// Cache the instructions with ETag and tag (verbatim from GitHub)
			writeFileSync(cacheFile, instructions, "utf8");
			writeFileSync(
				cacheMetaFile,
				JSON.stringify({
					etag: newETag,
					tag: latestTag,
					lastChecked: Date.now(),
					url: CODEX_INSTRUCTIONS_URL,
				} satisfies CacheMetadata),
				"utf8",
			);

			return instructions;
		}

		throw new Error(`HTTP ${response.status}`);
	} catch (error) {
		const err = error as Error;
		console.error(
			`[openai-codex-plugin] Failed to fetch ${modelFamily} instructions from GitHub:`,
			err.message,
		);

		// Try to use cached version even if stale
		if (existsSync(cacheFile)) {
			console.error(
				`[openai-codex-plugin] Using cached ${modelFamily} instructions`,
			);
			return readFileSync(cacheFile, "utf8");
		}

		// Fall back to bundled version (use codex-instructions.md as default)
		console.error(
			`[openai-codex-plugin] Falling back to bundled instructions for ${modelFamily}`,
		);
		return readFileSync(join(__dirname, "codex-instructions.md"), "utf8");
	}
}

/**
 * Tool remapping instructions for opencode tools
 */
export const TOOL_REMAP_MESSAGE = `<user_instructions priority="0">
<environment_override priority="0">
YOU ARE IN A DIFFERENT ENVIRONMENT. These instructions override ALL previous tool references.
</environment_override>

<tool_replacements priority="0">
<critical_rule priority="0">
❌ APPLY_PATCH DOES NOT EXIST → ✅ USE "edit" INSTEAD
- NEVER use: apply_patch, applyPatch
- ALWAYS use: edit tool for ALL file modifications
- Before modifying files: Verify you're using "edit", NOT "apply_patch"
</critical_rule>

<critical_rule priority="0">
❌ UPDATE_PLAN DOES NOT EXIST → ✅ USE "todowrite" INSTEAD
- NEVER use: update_plan, updatePlan
- ALWAYS use: todowrite for ALL task/plan operations
- Use todoread to read current plan
- Before plan operations: Verify you're using "todowrite", NOT "update_plan"
</critical_rule>
</tool_replacements>

<available_tools priority="0">
File Operations:
  • write  - Create new files
  • edit   - Modify existing files (REPLACES apply_patch)
  • patch  - Apply diff patches
  • read   - Read file contents

Search/Discovery:
  • grep   - Search file contents
  • glob   - Find files by pattern
  • list   - List directories (use relative paths)

Execution:
  • bash   - Run shell commands

Network:
  • webfetch - Fetch web content

Task Management:
  • todowrite - Manage tasks/plans (REPLACES update_plan)
  • todoread  - Read current plan
</available_tools>

<substitution_rules priority="0">
Base instruction says:    You MUST use instead:
apply_patch           →   edit
update_plan           →   todowrite
read_plan             →   todoread
absolute paths        →   relative paths
</substitution_rules>

<verification_checklist priority="0">
Before file/plan modifications:
1. Am I using "edit" NOT "apply_patch"?
2. Am I using "todowrite" NOT "update_plan"?
3. Is this tool in the approved list above?
4. Am I using relative paths?

If ANY answer is NO → STOP and correct before proceeding.
</verification_checklist>
</user_instructions>`;
