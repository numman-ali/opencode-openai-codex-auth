# Changelog

All notable changes to this project are documented here. Dates use the ISO format (YYYY-MM-DD).

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
