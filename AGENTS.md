# AGENTS.md

This file provides coding guidance for AI agents (including Claude Code, Codex, and others) when working with code in this repository.

## Overview

This is an **opencode plugin** that enables OAuth authentication with OpenAI's ChatGPT Plus/Pro Codex backend. It allows users to access `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`, `gpt-5-codex`, `gpt-5-codex-mini`, `gpt-5.1`, and `gpt-5` models through their ChatGPT subscription instead of using OpenAI Platform API credits.

**Key architecture principle**: 7-step fetch flow that intercepts opencode's OpenAI SDK requests, transforms them for the ChatGPT backend API, and handles OAuth token management.

## Build & Test Commands

```bash
# Build (compiles TypeScript + copies HTML file)
npm run build

# Type checking only (no build)
npm run typecheck

# Run all tests
npm test

# Watch mode for TDD
npm run test:watch

# Interactive test UI
npm run test:ui

# Coverage report
npm run test:coverage
```

**Important**: The build script has a critical step that copies `lib/oauth-success.html` to `dist/lib/`. This HTML file is required for the OAuth callback flow.

## Code Architecture

### Plugin Flow (index.ts)

The main entry point orchestrates a **7-step fetch flow**:

1. **Token Management**: Check token expiration, refresh if needed
2. **URL Rewriting**: Transform OpenAI Platform API URLs → ChatGPT backend API (`https://chatgpt.com/backend-api/codex/responses`)
3. **Request Transformation**:
   - Normalize model names (all variants → `gpt-5.1`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`, `gpt-5`, `gpt-5-codex`, or `codex-mini-latest`)
   - Inject Codex system instructions from latest GitHub release
   - Apply reasoning configuration (effort, summary, verbosity)
   - Add CODEX_MODE bridge prompt (default) or tool remap message (legacy)
   - Filter OpenCode system prompts when in CODEX_MODE
   - Filter conversation history (remove `rs_*` IDs for stateless operation)
4. **Headers**: Add OAuth token + ChatGPT account ID
5. **Request Execution**: Send to Codex backend
6. **Response Logging**: Optional debug logging (ENABLE_PLUGIN_REQUEST_LOGGING=1)
7. **Response Handling**: Convert SSE to JSON (non-tool requests) or pass through

### Module Organization

**Core Plugin** (`index.ts`)
- Plugin definition and main fetch orchestration
- OAuth loader (extracts ChatGPT account ID from JWT)
- Configuration loading and CODEX_MODE determination

**Authentication** (`lib/auth/`)
- `auth.ts`: OAuth flow (PKCE, token exchange, JWT decoding, refresh)
- `server.ts`: Local HTTP server for OAuth callback (port 1455)
- `browser.ts`: Platform-specific browser opening

**Request Handling** (`lib/request/`)
- `fetch-helpers.ts`: 10 focused helper functions for main fetch flow
- `request-transformer.ts`: Body transformations (model normalization, reasoning config, input filtering)
- `response-handler.ts`: SSE to JSON conversion

**Prompts** (`lib/prompts/`)
- `codex.ts`: Fetches Codex instructions from GitHub (ETag-cached), tool remap message
- `codex-opencode-bridge.ts`: CODEX_MODE bridge prompt for CLI parity

**Configuration** (`lib/`)
- `config.ts`: Plugin config loading, CODEX_MODE determination
- `constants.ts`: All magic values, URLs, error messages
- `types.ts`: TypeScript type definitions
- `logger.ts`: Debug logging (controlled by env var)

### Key Design Patterns

**1. Stateless Operation**: Uses `store: false` + `include: ["reasoning.encrypted_content"]`
- Allows multi-turn conversations without server-side storage
- Encrypted reasoning content persists context across turns

**2. CODEX_MODE** (enabled by default):
- **Priority**: `CODEX_MODE` env var > `~/.opencode/openai-codex-auth-config.json` > default (true)
- When enabled: Filters out OpenCode system prompts, adds Codex-OpenCode bridge prompt with Task tool & MCP awareness
- When disabled: Uses legacy tool remap message
- Bridge prompt (~550 tokens): Tool mappings, available tools, working style, **Task tool/sub-agent awareness**, **MCP tool awareness**
- **Prompt verification**: Caches OpenCode's codex.txt from GitHub (ETag-based) to verify exact prompt removal, with fallback to text signature matching

**3. Configuration Merging**:
- Global options (`provider.openai.options`) + per-model options (`provider.openai.models[name].options`)
- Model-specific options override global
- Plugin defaults: `reasoningEffort: "medium"`, `reasoningSummary: "auto"`, `textVerbosity: "medium"`

**4. Model Normalization**:
- All `gpt-5.1-codex-max*` variants → `gpt-5.1-codex-max`
- All `gpt-5.1-codex*` variants → `gpt-5.1-codex`
- All `gpt-5.1-codex-mini*` variants → `gpt-5.1-codex-mini`
- All `gpt-5-codex` variants → `gpt-5-codex`
- All `gpt-5-codex-mini*` or `codex-mini-latest` variants → `codex-mini-latest`
- All `gpt-5.1` variants → `gpt-5.1`
- All `gpt-5` variants → `gpt-5`
- `minimal` effort auto-normalized to `low` for Codex families and clamped to `medium` (or `high` when requested) for Codex Mini

**5. Codex Instructions Caching**:
- Fetches from latest release tag (not main branch)
- ETag-based HTTP conditional requests
- Cache invalidation when release tag changes
- Falls back to bundled version if GitHub unavailable

## Development Patterns

### Adding New Configuration Options

1. Add to `ConfigOptions` interface in `lib/types.ts`
2. Update `transformRequestBody()` in `lib/request/request-transformer.ts`
3. Add tests in `test/request-transformer.test.ts`
4. Document in README.md configuration section

### Modifying Request Transformation

All request transformations go through `transformRequestBody()`:
- Input filtering: `filterInput()`, `filterOpenCodeSystemPrompts()`
- Message injection: `addCodexBridgeMessage()` or `addToolRemapMessage()`
- Reasoning config: `getReasoningConfig()` (follows Codex CLI defaults, not opencode defaults)
- Model config: `getModelConfig()` (merges global + per-model options)

### OAuth Flow Modifications

OAuth implementation follows OpenAI Codex CLI patterns:
- Client ID: `app_EMoamEEZ73f0CkXaXp7hrann`
- PKCE with S256 challenge
- Special params: `codex_cli_simplified_flow=true`, `originator=codex_cli_rs`
- Callback server on port 1455 (matches Codex CLI)

### Testing Strategy

- **123 comprehensive tests** covering all modules
- Test files mirror source structure (`test/auth.test.ts` ↔ `lib/auth/auth.ts`)
- Mock-heavy testing (no actual network calls or file I/O in tests)
- Focus on edge cases: token expiration, model normalization, input filtering, CODEX_MODE toggling

## Important Configuration Differences

This plugin **intentionally differs from opencode defaults** because it accesses ChatGPT backend API (not OpenAI Platform API):

| Setting | opencode Default | This Plugin Default | Reason |
|---------|-----------------|---------------------|--------|
| `reasoningEffort` | "high" (gpt-5) | "medium" (Codex Max defaults to "high") | Matches Codex CLI default and Codex Max capabilities |
| `textVerbosity` | "low" (gpt-5) | "medium" | Matches Codex CLI default |
| `reasoningSummary` | "detailed" | "auto" | Matches Codex CLI default |
| gpt-5-codex config | (excluded) | Full support | opencode excludes gpt-5-codex from auto-config |
| `store` | true | false | Required for ChatGPT backend |
| `include` | (not set) | `["reasoning.encrypted_content"]` | Required for stateless operation |

## File Paths & Locations

- **Plugin config**: `~/.opencode/openai-codex-auth-config.json`
- **Cache dir**: `~/.opencode/cache/`
  - `codex-instructions.md` (Codex CLI instructions from GitHub)
  - `codex-instructions-meta.json` (ETag + release tag for Codex instructions)
  - `opencode-codex.txt` (OpenCode system prompt from GitHub, for verification)
  - `opencode-codex-meta.json` (ETag for OpenCode prompt)
- **Debug logs**: `~/.opencode/logs/codex-plugin/` (when `ENABLE_PLUGIN_REQUEST_LOGGING=1`)
- **OAuth callback**: `http://localhost:1455/auth/callback`

## Environment Variables

- `CODEX_MODE`: Override config file (1=enable, 0=disable)
- `ENABLE_PLUGIN_REQUEST_LOGGING`: Enable detailed request logging (1=enable)

## TypeScript Configuration

- Target: ES2022
- Module: ES2022 with bundler resolution
- Output: `./dist/`
- Strict mode enabled
- Declaration files generated
- Source maps enabled
- Excludes: `test/`, `node_modules/`, `dist/`

## Dependencies

**Production**:
- `@openauthjs/openauth` (OAuth PKCE implementation)

**Development**:
- `@opencode-ai/plugin` (peer dependency)
- `vitest` (testing framework)
- TypeScript

**Zero external runtime dependencies** - only uses Node.js built-ins for file I/O, HTTP, crypto.
