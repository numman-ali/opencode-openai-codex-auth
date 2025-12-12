# Changelog

All notable changes to this project are documented here. Dates use the ISO format (YYYY-MM-DD).

## [4.1.1] - 2025-12-11

**Minor release**: "none" reasoning effort support for GPT-5.2 and GPT-5.1.

### Added
- **"none" reasoning effort support**: GPT-5.1 and GPT-5.2 support `reasoning_effort: "none"` which disables the reasoning phase entirely. This can result in faster responses when reasoning is not needed.
  - `gpt-5.2-none` - GPT-5.2 with reasoning disabled
  - `gpt-5.1-none` - GPT-5.1 with reasoning disabled
- **4 new unit tests** for "none" reasoning behavior (now 197 total unit tests).

### Technical Details
- `getReasoningConfig()` now detects GPT-5.1 general purpose models (not Codex variants) and allows "none" to pass through.
- GPT-5.2 inherits "none" support as it's newer than GPT-5.1.
- Codex variants (gpt-5.1-codex, gpt-5.1-codex-max, gpt-5.1-codex-mini) do NOT support "none":
  - Codex and Codex Max: "none" auto-converts to "low"
  - Codex Mini: "none" auto-converts to "medium" (as before)
- Documentation updated with complete reasoning effort support matrix per model family.

### References
- **OpenAI API docs** (`platform.openai.com/docs/api-reference/chat/create`): "gpt-5.1 defaults to none, which does not perform reasoning. The supported reasoning values for gpt-5.1 are none, low, medium, and high."
- **Codex CLI** (`codex-rs/protocol/src/openai_models.rs`): `ReasoningEffort` enum includes `None` variant with `#[serde(rename_all = "lowercase")]` serialization to `"none"`.
- **Codex CLI** (`codex-rs/core/src/client.rs`): Request builder passes `ReasoningEffort::None` through to API without validation/rejection.
- **Codex CLI** (`docs/config.md`): Documents `model_reasoning_effort = "none"` as valid config option.

### Notes
- This plugin defaults to "medium" for better coding assistance; users must explicitly set "none" if desired.

## [4.1.0] - 2025-12-11

**Feature release**: GPT 5.2 model support and image input capabilities.

### Added
- **GPT 5.2 model family support**: Full support for OpenAI's latest GPT 5.2 model with 4 reasoning level presets:
  - `gpt-5.2-low` - Fast responses with light reasoning
  - `gpt-5.2-medium` - Balanced reasoning for general tasks
  - `gpt-5.2-high` - Complex reasoning and analysis
  - `gpt-5.2-xhigh` - Deep multi-hour analysis (same as Codex Max)
- **Full image input support**: All 16 model variants now include `modalities.input: ["text", "image"]` enabling full multimodal capabilities - read screenshots, diagrams, UI mockups, and any image directly in OpenCode.
- **GPT 5.2 model family** added to `codex.ts` with dedicated prompt handling.
- **Test coverage**: Updated integration tests to verify all 16 models (was 13), now 193 unit tests + 16 integration tests.

### Changed
- **Model ordering**: Config now ordered by model family priority: GPT 5.2 → Codex Max → Codex → Codex Mini → GPT 5.1.
- **Removed default presets**: Removed `gpt-5.1-codex-max` and `gpt-5.2` (without reasoning suffix) to enforce explicit reasoning level selection.
- **Test script**: `scripts/test-all-models.sh` now uses local dist for testing and includes GPT 5.2 tests.
- **Documentation**: Updated README with GPT 5.2 models, image support, and condensed config example.

### Technical Details
- GPT 5.2 maps to `gpt-5.2` API model with same reasoning options as Codex Max (`low/medium/high/xhigh`).
- `getModelFamily()` now returns `"gpt-5.2"` for GPT 5.2 models, using Codex Max prompts.
- `getReasoningConfig()` treats GPT 5.2 like Codex Max for `xhigh` reasoning support.
- Model normalization pattern matching updated to recognize GPT 5.2 before other patterns.

## [4.0.2] - 2025-11-27

**Bugfix release**: Fixes compaction context loss, agent creation, and SSE/JSON response handling.

### Fixed
- **Compaction losing context**: v4.0.1 was too aggressive in filtering tool calls - it removed ALL `function_call`/`function_call_output` items when tools weren't present. Now only **orphaned** outputs (without matching calls) are filtered, preserving matched pairs for compaction context.
- **Agent creation failing**: The `/agent create` command was failing with "Invalid JSON response" because we were returning SSE streams instead of JSON for `generateText()` requests.
- **SSE/JSON response handling**: Properly detect original request intent - `streamText()` requests get SSE passthrough, `generateText()` requests get SSE→JSON conversion.

### Added
- **`gpt-5.1-chat-latest` model support**: Added to model map, normalizes to `gpt-5.1`.

### Technical Details
- Root cause of compaction issue: OpenCode sends `item_reference` with `fc_*` IDs for function calls. We filter these for stateless mode, but v4.0.1 then removed ALL tool items. Now we only remove orphaned `function_call_output` items (where no matching `function_call` exists).
- Root cause of agent creation issue: We were forcing `stream: true` for all requests and returning SSE for all responses. Now we capture original `stream` value before transformation and convert SSE→JSON only when original request wasn't streaming.
- The Codex API always receives `stream: true` (required), but response handling is based on original intent.

## [4.0.1] - 2025-11-27

**Bugfix release**: Fixes API errors during summary/compaction and GitHub rate limiting.

### Fixed
- **Orphaned `function_call_output` errors**: Fixed 400 errors during summary/compaction requests when OpenCode sends `item_reference` pointers to server-stored function calls. The plugin now filters out `function_call` and `function_call_output` items when no tools are present in the request.
- **GitHub API rate limiting**: Added fallback mechanism when fetching Codex instructions from GitHub. If the API returns 403 (rate limit), the plugin now falls back to parsing the HTML releases page.

### Technical Details
- Root cause: OpenCode's secondary model (gpt-5-nano) uses `item_reference` with `fc_*` IDs to reference stored function calls. Our plugin filters `item_reference` for stateless mode (`store: false`), leaving `function_call_output` orphaned. The Codex API rejects requests with orphaned outputs.
- Fix: When `hasTools === false`, filter out all `function_call` and `function_call_output` items from the input array.
- GitHub fallback chain: API endpoint → HTML page → redirect URL parsing → HTML regex parsing.

## [4.0.0] - 2025-11-25

**Major release**: Complete prompt engineering overhaul matching official Codex CLI behavior, with full **GPT-5.1 Codex Max** support.

### Highlights
- **Full Codex Max support** with dedicated prompt including frontend design guidelines
- **Model-specific prompts** matching Codex CLI's prompt selection logic
- **GPT-5.0 → GPT-5.1 migration** as legacy models are phased out

### Added
- **Model-specific system prompts**: Plugin now fetches the correct Codex prompt based on model family, matching Codex CLI's `model_family.rs` logic:
  - `gpt-5.1-codex-max*` → `gpt-5.1-codex-max_prompt.md` (117 lines, includes frontend design guidelines)
  - `gpt-5.1-codex*`, `gpt-5.1-codex-mini*` → `gpt_5_codex_prompt.md` (105 lines, focused coding prompt)
  - `gpt-5.1*` → `gpt_5_1_prompt.md` (368 lines, full behavioral guidance)
- New `ModelFamily` type (`"codex-max" | "codex" | "gpt-5.1"`) for prompt selection.
- New `getModelFamily()` function to determine prompt selection based on normalized model name.
- Model family now logged in request logs for debugging (`modelFamily` field in after-transform logs).
- 16 new unit tests for model family detection (now **191 total unit tests**).
- Integration tests now verify correct model family selection (13 integration tests with family verification).

### Changed
- **Legacy GPT-5.0 models now map to GPT-5.1**: All legacy `gpt-5` model variants automatically normalize to their `gpt-5.1` equivalents as GPT-5.0 is being phased out by OpenAI:
  - `gpt-5-codex` → `gpt-5.1-codex`
  - `gpt-5` → `gpt-5.1`
  - `gpt-5-mini`, `gpt-5-nano` → `gpt-5.1`
  - `codex-mini-latest` → `gpt-5.1-codex-mini`
- **Lazy instruction loading**: Instructions are now fetched per-request based on model family (not pre-loaded at initialization).
- **Separate caching per model family**: Each model family has its own cached prompt file:
  - `codex-max-instructions.md` + `codex-max-instructions-meta.json`
  - `codex-instructions.md` + `codex-instructions-meta.json`
  - `gpt-5.1-instructions.md` + `gpt-5.1-instructions-meta.json`

### Fixed
- Fixed OpenCode prompt cache URL to fetch from `dev` branch instead of non-existent `main` branch.
- Fixed model configuration test script to correctly identify model logs in multi-model sessions (opencode uses a small model like `gpt-5-nano` for title generation alongside the user's selected model).

### Technical Details
This release brings full parity with Codex CLI's prompt engineering:
- **Codex family** (105 lines): Concise, tool-focused prompt for coding tasks
- **Codex Max family** (117 lines): Adds frontend design guidelines for UI work
- **GPT-5.1 general** (368 lines): Comprehensive behavioral guidance, personality, planning

## [3.3.0] - 2025-11-19
### Added
- GPT 5.1 Codex Max support: normalization, per-model defaults, and new presets (`gpt-5.1-codex-max`, `gpt-5.1-codex-max-xhigh`) with extended reasoning options (including `none`/`xhigh`) while keeping the 272k context / 128k output limits.
- Typing and config support for new reasoning options (`none`/`xhigh`, summary `off`/`on`) plus updated test matrix entries.

### Changed
- Codex Mini clamping now downgrades unsupported `xhigh` to `high` and guards against `none`/`minimal` inputs.
- Documentation, config guides, and validation scripts now reflect 13 verified GPT 5.1 variants (3 codex, 5 codex-max, 2 codex-mini, 3 general), including Codex Max. See README for details on pre-configured variants.

## [3.2.0] - 2025-11-14
### Added
- GPT 5.1 model family support: normalization for `gpt-5.1`, `gpt-5.1-codex`, and `gpt-5.1-codex-mini` plus new GPT 5.1-only presets in the canonical `config/full-opencode.json`.
- Documentation updates (README, docs, AGENTS) describing the 5.1 families, their reasoning defaults, and how they map to ChatGPT slugs and token limits.

### Changed
- Model normalization docs and tests now explicitly cover both 5.0 and 5.1 Codex/general families and the two Codex Mini tiers.
- The legacy GPT 5.0 full configuration is now published as `config/full-opencode-gpt5.json`; new installs should prefer the 5.1 presets.

## [3.1.0] - 2025-11-11
### Added
- Codex Mini support end-to-end: normalization to the `codex-mini-latest` slug, proper reasoning defaults, and two new presets (`gpt-5-codex-mini-medium` / `gpt-5-codex-mini-high`).
- Documentation & configuration updates describing the Codex Mini tier (200k input / 100k output tokens) plus refreshed totals (11 presets, 160+ unit tests).

### Fixed
- Prevented Codex Mini from inheriting the lightweight (`minimal`) reasoning profile used by `gpt-5-mini`/`nano`, ensuring the API always receives supported effort levels.

## [3.0.0] - 2025-11-04
### Added
- Codex-style usage-limit messaging that mirrors the 5-hour and weekly windows reported by the Codex CLI.
- Documentation guidance noting that OpenCode's context auto-compaction and usage sidebar require the canonical `config/full-opencode.json`.

### Changed
- Prompt caching now relies solely on the host-supplied `prompt_cache_key`; conversation/session headers are forwarded only when OpenCode provides one.
- CODEX_MODE bridge prompt refreshed to the newest Codex CLI release so tool awareness stays in sync.

### Fixed
- Clarified README, docs, and configuration references so the canonical config matches shipped behaviour.
- Pinned `hono` (4.10.4) and `vite` (7.1.12) to resolve upstream security advisories.

## [2.1.2] - 2025-10-12
### Added
- Comprehensive compliance documentation (ToS guidance, security, privacy) and a full user/developer doc set.

### Fixed
- Per-model configuration lookup, stateless multi-turn conversations, case-insensitive model normalization, and GitHub instruction caching.

## [2.1.1] - 2025-10-04
### Fixed
- README cache-clearing snippet now runs in a subshell from the home directory to avoid path issues while removing cached plugin files.

## [2.1.0] - 2025-10-04
### Added
- Enhanced CODEX_MODE bridge prompt with Task tool and MCP awareness plus ETag-backed verification of OpenCode system prompts.

### Changed
- Request transformation made async to support prompt verification caching; AGENTS.md renamed to provide cross-agent guidance.

## [2.0.0] - 2025-10-03
### Added
- Full TypeScript rewrite with strict typing, 123 automated tests, and nine pre-configured model variants matching the Codex CLI.
- CODEX_MODE introduced (enabled by default) with a lightweight bridge prompt and configurability via config file or `CODEX_MODE` env var.

### Changed
- Library reorganized into semantic folders (auth, prompts, request, etc.) and OAuth flow polished with the new success page.

## [1.0.3] - 2025-10-02
### Changed
- Major internal refactor splitting the runtime into focused modules (logger, request/response handlers) and removing legacy debug output.

## [1.0.2] - 2025-10-02
### Added
- ETag-based GitHub caching for Codex instructions and release-tag tracking for more stable prompt updates.

### Fixed
- Default model fallback, text verbosity initialization, and standardized error logging prefixes.

## [1.0.1] - 2025-10-01
### Added
- README clarifications: opencode auto-installs plugins, config locations, and streamlined quick-start instructions.

## [1.0.0] - 2025-10-01
### Added
- Initial production release with ChatGPT Plus/Pro OAuth support, tool remapping, auto-updating Codex instructions, and zero runtime dependencies.
