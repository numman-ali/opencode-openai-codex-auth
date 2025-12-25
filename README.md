# OpenAI ChatGPT OAuth Plugin for opencode

[![npm version](https://img.shields.io/npm/v/opencode-openai-codex-auth.svg)](https://www.npmjs.com/package/opencode-openai-codex-auth)
[![Tests](https://github.com/numman-ali/opencode-openai-codex-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/numman-ali/opencode-openai-codex-auth/actions)
[![npm downloads](https://img.shields.io/npm/dm/opencode-openai-codex-auth.svg)](https://www.npmjs.com/package/opencode-openai-codex-auth)

This plugin enables opencode to use OpenAI's Codex backend via ChatGPT Plus/Pro OAuth authentication, allowing you to use your ChatGPT subscription instead of OpenAI Platform API credits.

> **Found this useful?**
Follow me on [X @nummanali](https://x.com/nummanali) for future updates and more projects!

## ⚠️ Terms of Service & Usage Notice

**Important:** This plugin is designed for **personal development use only** with your own ChatGPT Plus/Pro subscription. By using this tool, you agree to:

- ✅ Use only for individual productivity and coding assistance
- ✅ Respect OpenAI's rate limits and usage policies
- ✅ Not use to power commercial services or resell access
- ✅ Comply with [OpenAI's Terms of Use](https://openai.com/policies/terms-of-use/) and [Usage Policies](https://openai.com/policies/usage-policies/)

**This tool uses OpenAI's official OAuth authentication** (the same method as OpenAI's official Codex CLI). However, users are responsible for ensuring their usage complies with OpenAI's terms.

### ⚠️ Not Suitable For:
- Commercial API resale or white-labeling
- High-volume automated extraction beyond personal use
- Applications serving multiple users with one subscription
- Any use that violates OpenAI's acceptable use policies

**For production applications or commercial use, use the [OpenAI Platform API](https://platform.openai.com/) with proper API keys.**

---

## Features

- ✅ **ChatGPT Plus/Pro OAuth authentication** - Use your existing subscription
- ✅ **22 pre-configured model variants** - GPT 5.2, GPT 5.2 Codex, GPT 5.1, GPT 5.1 Codex, GPT 5.1 Codex Max, and GPT 5.1 Codex Mini presets for all reasoning levels
- ✅ **GPT 5.2 + GPT 5.2 Codex support** - Latest models with `low/medium/high/xhigh` reasoning levels (Codex excludes `none`)
- ✅ **Full image input support** - All models configured with multimodal capabilities for reading screenshots, diagrams, and images
- ⚠️ **GPT 5.1+ only** - Older GPT 5.0 models are deprecated and may not work reliably
- ✅ **Zero external dependencies** - Lightweight with only @openauthjs/openauth
- ✅ **Auto-refreshing tokens** - Handles token expiration automatically
- ✅ **Prompt caching** - Reuses responses across turns via stable `prompt_cache_key`
- ✅ **Smart auto-updating Codex instructions** - Tracks latest stable release with ETag caching
- ✅ **Full tool support** - write, edit, bash, grep, glob, and more
- ✅ **CODEX_MODE** - Codex-OpenCode bridge prompt with Task tool & MCP awareness (enabled by default)
- ✅ **Automatic tool remapping** - Codex tools → opencode tools
- ✅ **Configurable reasoning** - Control effort, summary verbosity, and text output
- ✅ **Usage-aware errors** - Shows clear guidance when ChatGPT subscription limits are reached
- ✅ **Type-safe & tested** - Strict TypeScript with 200+ unit tests + integration tests
- ✅ **Modular architecture** - Easy to maintain and extend

## Installation

### Quick Start

**No npm install needed!** opencode automatically installs plugins when you add them to your config.

### Plugin Versioning & Updates

**⚠️ Important**: OpenCode does NOT auto-update plugins. You must pin versions for reliable updates.

#### Recommended: Pin the Version

```json
"plugin": ["opencode-openai-codex-auth@4.2.0"]
```

**Why pin versions?** OpenCode uses Bun's lockfile which pins resolved versions. If you use `"opencode-openai-codex-auth"` without a version, it resolves to "latest" once and **never updates** even when new versions are published.

#### Upgrading to a New Version

Simply change the version in your config and restart OpenCode:

```json
// Change from:
"plugin": ["opencode-openai-codex-auth@3.3.0"]

// To:
"plugin": ["opencode-openai-codex-auth@4.2.0"]
```

OpenCode will detect the version mismatch and install the new version automatically.

#### If You're Stuck on an Old Version

If you previously used an unpinned version, clear the cache:

```bash
rm -rf ~/.cache/opencode
```

Then restart OpenCode with a pinned version in your config.

Check [releases](https://github.com/numman-ali/opencode-openai-codex-auth/releases) for version history.

---

### Agent Instructions (Install / Update)

If you’re using an AI agent (Codex/Claude/etc.) to install or update this plugin on a machine, use these steps:

1. **Use the official repo**: https://github.com/numman-ali/opencode-openai-codex-auth
2. **Pin the plugin version** in the user’s OpenCode config (`~/.config/opencode/opencode.json` or project `.opencode.json`).
3. **Replace the config** with the latest `config/full-opencode.json` from the repo.
4. **Refresh the plugin cache** so OpenCode reinstalls the updated version.
5. **Restart OpenCode**.

```bash
# 1) Update plugin version (replace <latest> with newest release tag)
# Example: opencode-openai-codex-auth@4.2.0

# 2) Copy full config
cp <repo>/config/full-opencode.json ~/.config/opencode/opencode.json

# 3) Refresh OpenCode plugin cache
rm -rf ~/.cache/opencode

# 4) Optional sanity check for GPT-5.2-Codex presets
jq '.provider.openai.models | keys | map(select(startswith("gpt-5.2-codex")))' \
  ~/.config/opencode/opencode.json
```

> **Note**: If using a project-local config, replace the target path with `<project>/.opencode.json`.

---

#### ⚠️ REQUIRED: Full Configuration (Only Supported Setup)

**IMPORTANT**: You MUST use the full configuration from [`config/full-opencode.json`](./config/full-opencode.json). Other configurations are not officially supported and may not work reliably.

**Why the full config is required:**
- GPT 5 models can be temperamental - some work, some don't, some may error
- The full config has been tested and verified to work
- Minimal configs lack proper model metadata for OpenCode features
- Older GPT 5.0 models are deprecated and being phased out by OpenAI

1. **Copy the full configuration** from [`config/full-opencode.json`](./config/full-opencode.json) to your opencode config file.

   The config includes 22 models with image input support. Here's a condensed example showing the structure:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-openai-codex-auth@4.2.0"],
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "medium",
        "reasoningSummary": "auto",
        "textVerbosity": "medium",
        "include": ["reasoning.encrypted_content"],
        "store": false
      },
      "models": {
        "gpt-5.2-high": {
          "name": "GPT 5.2 High (OAuth)",
          "limit": { "context": 272000, "output": 128000 },
          "modalities": { "input": ["text", "image"], "output": ["text"] },
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-codex-max-high": {
          "name": "GPT 5.1 Codex Max High (OAuth)",
          "limit": { "context": 272000, "output": 128000 },
          "modalities": { "input": ["text", "image"], "output": ["text"] },
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        }
        // ... 20 more models - see config/full-opencode.json for complete list
      }
    }
  }
}
```

   **⚠️ Copy the complete file** from [`config/full-opencode.json`](./config/full-opencode.json) - don't use this truncated example.

   **Global config**: `~/.config/opencode/opencode.json`
   **Project config**: `<project>/.opencode.json`

   This gives you 22 model variants with different reasoning levels:
   - **gpt-5.2** (none/low/medium/high/xhigh) - Latest GPT 5.2 model with full reasoning support
   - **gpt-5.2-codex** (low/medium/high/xhigh) - GPT 5.2 Codex presets
   - **gpt-5.1-codex-max** (low/medium/high/xhigh) - Codex Max presets
   - **gpt-5.1-codex** (low/medium/high) - Codex model presets
   - **gpt-5.1-codex-mini** (medium/high) - Codex mini tier presets
   - **gpt-5.1** (none/low/medium/high) - General-purpose reasoning presets

   All appear in the opencode model selector as "GPT 5.1 Codex Low (OAuth)", "GPT 5.1 High (OAuth)", etc.

### Prompt caching & usage limits

Codex backend caching is enabled automatically. When OpenCode supplies a `prompt_cache_key` (its session identifier), the plugin forwards it unchanged so Codex can reuse work between turns. The plugin no longer synthesizes its own cache IDs—if the host omits `prompt_cache_key`, Codex will treat the turn as uncached. The bundled CODEX_MODE bridge prompt is synchronized with the latest Codex CLI release, so opencode and Codex stay in lock-step on tool availability. When your ChatGPT subscription nears a limit, opencode surfaces the plugin's friendly error message with the 5-hour and weekly windows, mirroring the Codex CLI summary.

> **⚠️ IMPORTANT:** You MUST use the full configuration above. OpenCode's context auto-compaction and usage sidebar only work with the full config. Additionally, GPT 5 models require proper configuration - minimal configs are NOT supported and may fail unpredictably.

#### ❌ Minimal Configuration (NOT RECOMMENDED - DO NOT USE)

**DO NOT use minimal configurations** - they are not supported for GPT 5.1 and will not work reliably:

```json
// ❌ DO NOT USE THIS - WILL NOT WORK RELIABLY
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-openai-codex-auth"
  ],
  "model": "openai/gpt-5-codex"
}
```

**Why this doesn't work:**
- Unpinned plugin version won't receive updates (see [Plugin Versioning](#plugin-versioning--updates))
- GPT 5 models are temperamental and need proper configuration
- Missing model metadata breaks OpenCode features
- No support for usage limits or context compaction
- Cannot guarantee stable operation

2. **That's it!** opencode will auto-install the plugin on first run.

> **New to opencode?** Learn more at [opencode.ai](https://opencode.ai)

## Authentication

```bash
opencode auth login
```

Select "OpenAI" → "ChatGPT Plus/Pro (Codex Subscription)"

> **⚠️ First-time setup**: Stop Codex CLI if running (both use port 1455)

---

## Usage

If using the full configuration, select from the model picker in opencode, or specify via command line:

```bash
# Use different reasoning levels for gpt-5.1-codex
opencode run "simple task" --model=openai/gpt-5.1-codex-low
opencode run "complex task" --model=openai/gpt-5.1-codex-high
opencode run "large refactor" --model=openai/gpt-5.1-codex-max-high
opencode run "research-grade analysis" --model=openai/gpt-5.1-codex-max-xhigh

# Use different reasoning levels for gpt-5.1
opencode run "quick question" --model=openai/gpt-5.1-low
opencode run "deep analysis" --model=openai/gpt-5.1-high

# Use Codex Mini variants
opencode run "balanced task" --model=openai/gpt-5.1-codex-mini-medium
opencode run "complex code" --model=openai/gpt-5.1-codex-mini-high
```

### Available Model Variants (Full Config)

When using [`config/full-opencode.json`](./config/full-opencode.json), you get these pre-configured variants:

| CLI Model ID | TUI Display Name | Reasoning Effort | Best For |
|--------------|------------------|-----------------|----------|
| `gpt-5.2-none` | GPT 5.2 None (OAuth) | None | Fastest GPT 5.2 responses (no reasoning) |
| `gpt-5.2-low` | GPT 5.2 Low (OAuth) | Low | Fast GPT 5.2 responses |
| `gpt-5.2-medium` | GPT 5.2 Medium (OAuth) | Medium | Balanced GPT 5.2 tasks |
| `gpt-5.2-high` | GPT 5.2 High (OAuth) | High | Complex GPT 5.2 reasoning |
| `gpt-5.2-xhigh` | GPT 5.2 Extra High (OAuth) | xHigh | Deep GPT 5.2 analysis |
| `gpt-5.2-codex-low` | GPT 5.2 Codex Low (OAuth) | Low | Fast GPT 5.2 Codex responses |
| `gpt-5.2-codex-medium` | GPT 5.2 Codex Medium (OAuth) | Medium | Balanced GPT 5.2 Codex coding tasks |
| `gpt-5.2-codex-high` | GPT 5.2 Codex High (OAuth) | High | Complex GPT 5.2 Codex reasoning & tools |
| `gpt-5.2-codex-xhigh` | GPT 5.2 Codex Extra High (OAuth) | xHigh | Deep GPT 5.2 Codex long-horizon work |
| `gpt-5.1-codex-max-low` | GPT 5.1 Codex Max Low (OAuth) | Low | Fast exploratory large-context work |
| `gpt-5.1-codex-max-medium` | GPT 5.1 Codex Max Medium (OAuth) | Medium | Balanced large-context builds |
| `gpt-5.1-codex-max-high` | GPT 5.1 Codex Max High (OAuth) | High | Long-horizon builds, large refactors |
| `gpt-5.1-codex-max-xhigh` | GPT 5.1 Codex Max Extra High (OAuth) | xHigh | Deep multi-hour agent loops, research/debug marathons |
| `gpt-5.1-codex-low` | GPT 5.1 Codex Low (OAuth) | Low | Fast code generation |
| `gpt-5.1-codex-medium` | GPT 5.1 Codex Medium (OAuth) | Medium | Balanced code tasks |
| `gpt-5.1-codex-high` | GPT 5.1 Codex High (OAuth) | High | Complex code & tools |
| `gpt-5.1-codex-mini-medium` | GPT 5.1 Codex Mini Medium (OAuth) | Medium | Lightweight Codex mini tier |
| `gpt-5.1-codex-mini-high` | GPT 5.1 Codex Mini High (OAuth) | High | Codex Mini with maximum reasoning |
| `gpt-5.1-none` | GPT 5.1 None (OAuth) | None | Fastest GPT 5.1 responses (no reasoning) |
| `gpt-5.1-low` | GPT 5.1 Low (OAuth) | Low | Faster responses with light reasoning |
| `gpt-5.1-medium` | GPT 5.1 Medium (OAuth) | Medium | Balanced general-purpose tasks |
| `gpt-5.1-high` | GPT 5.1 High (OAuth) | High | Deep reasoning, complex problems |

**Usage**: `--model=openai/<CLI Model ID>` (e.g., `--model=openai/gpt-5.1-codex-low`)
**Display**: TUI shows the friendly name (e.g., "GPT 5.1 Codex Low (OAuth)")

> **Note**: All `gpt-5.1-codex-mini*` presets map directly to the `gpt-5.1-codex-mini` slug with standard Codex limits (272k context / 128k output).
>
> **Note**: GPT 5.2, GPT 5.2 Codex, and Codex Max all support `xhigh` reasoning. Use explicit reasoning levels (e.g., `gpt-5.2-high`, `gpt-5.2-codex-xhigh`, `gpt-5.1-codex-max-xhigh`) for precise control.

> **⚠️ Important**: GPT 5 models can be temperamental - some variants may work better than others, some may give errors, and behavior may vary. Stick to the presets above configured in `full-opencode.json` for best results.

All accessed via your ChatGPT Plus/Pro subscription.

### Using in Custom Commands

**Important**: Always include the `openai/` prefix:

```yaml
# ✅ Correct
model: openai/gpt-5.1-codex-low

# ❌ Wrong - will fail
model: gpt-5.1-codex-low
```

See [Configuration Guide](https://numman-ali.github.io/opencode-openai-codex-auth/configuration) for advanced usage.

### Plugin Defaults

When no configuration is specified, the plugin uses these defaults for all GPT-5 models:

```json
{
  "reasoningEffort": "medium",
  "reasoningSummary": "auto",
  "textVerbosity": "medium"
}
```

- **`reasoningEffort: "medium"`** - Balanced computational effort for reasoning
- **`reasoningSummary: "auto"`** - Automatically adapts summary verbosity
- **`textVerbosity: "medium"`** - Balanced output length

Codex Max, GPT 5.2, and GPT 5.2 Codex default to `reasoningEffort: "high"` when selected, while other families default to `medium`.

These defaults are tuned for Codex CLI-style usage and can be customized (see Configuration below).

## Configuration

### ⚠️ REQUIRED: Use Pre-Configured File

**YOU MUST use [`config/full-opencode.json`](./config/full-opencode.json)** - this is the only officially supported configuration:
- 22 pre-configured model variants (GPT 5.2, GPT 5.2 Codex, GPT 5.1, Codex, Codex Max, Codex Mini)
- Image input support enabled for all models
- Optimal configuration for each reasoning level
- All variants visible in the opencode model selector
- Required metadata for OpenCode features to work properly

**Do NOT use other configurations** - they are not supported and may fail unpredictably with GPT 5 models.

See [Installation](#installation) for setup instructions.

### Custom Configuration

If you want to customize settings yourself, you can configure options at provider or model level.

#### Available Settings

⚠️ **Important**: Families have different supported values.

| Setting | GPT-5.2 Values | GPT-5.2-Codex Values | GPT-5.1 Values | GPT-5.1-Codex Values | GPT-5.1-Codex-Max Values | Plugin Default |
|---------|---------------|----------------------|----------------|----------------------|---------------------------|----------------|
| `reasoningEffort` | `none`, `low`, `medium`, `high`, `xhigh` | `low`, `medium`, `high`, `xhigh` | `none`, `low`, `medium`, `high` | `low`, `medium`, `high` | `low`, `medium`, `high`, `xhigh` | `medium` (global), `high` for Codex Max/5.2/5.2 Codex |
| `reasoningSummary` | `auto`, `concise`, `detailed` | `auto`, `concise`, `detailed` | `auto`, `concise`, `detailed` | `auto`, `concise`, `detailed` | `auto`, `concise`, `detailed`, `off`, `on` | `auto` |
| `textVerbosity` | `low`, `medium`, `high` | `medium` or `high` | `low`, `medium`, `high` | `medium` or `high` | `medium` or `high` | `medium` |
| `include` | Array of strings | Array of strings | Array of strings | Array of strings | Array of strings | `["reasoning.encrypted_content"]` |

> **Notes**:
> - GPT 5.2 and GPT 5.1 (general purpose) support `none` reasoning per OpenAI API docs.
> - `none` is NOT supported for Codex variants (including GPT 5.2 Codex) - auto-converts to `low` for Codex/Codex Max, or `medium` for Codex Mini.
> - GPT 5.2, GPT 5.2 Codex, and Codex Max support `xhigh` reasoning.
> - `minimal` effort is auto-normalized to `low` for Codex models.
> - Codex Mini clamps to `medium`/`high`; `xhigh` downgrades to `high`.
> - All models have `modalities.input: ["text", "image"]` enabled for multimodal support.

#### Global Configuration Example

Apply settings to all models:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-openai-codex-auth@4.2.0"],
  "model": "openai/gpt-5-codex",
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "high",
        "reasoningSummary": "detailed"
      }
    }
  }
}
```

#### Custom Model Variants Example

Create your own named variants in the model selector:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-openai-codex-auth@4.2.0"],
  "provider": {
    "openai": {
      "models": {
        "codex-fast": {
          "name": "My Fast Codex",
          "options": {
            "reasoningEffort": "low"
          }
        },
        "gpt-5-smart": {
          "name": "My Smart GPT-5",
          "options": {
            "reasoningEffort": "high",
            "textVerbosity": "high"
          }
        }
      }
    }
  }
}
```

**Config key** (e.g., `codex-fast`) is used in CLI: `--model=openai/codex-fast`
**`name` field** (e.g., `"My Fast Codex"`) appears in model selector
**Model type** is auto-detected from the key (contains "codex" → gpt-5-codex, else → gpt-5)

### Advanced Configuration

For advanced options, custom presets, and troubleshooting:

**📖 [Configuration Guide](https://numman-ali.github.io/opencode-openai-codex-auth/configuration)** - Complete reference with examples

## Rate Limits & Responsible Use

This plugin respects the same rate limits enforced by OpenAI's official Codex CLI:

- **Rate limits are determined by your ChatGPT subscription tier** (Plus/Pro)
- **Limits are enforced server-side** through OAuth tokens
- **The plugin does NOT and CANNOT bypass** OpenAI's rate limits

### Best Practices:
- ✅ Use for individual coding tasks, not bulk processing
- ✅ Avoid rapid-fire automated requests
- ✅ Monitor your usage to stay within subscription limits
- ✅ Consider the OpenAI Platform API for higher-volume needs
- ❌ Do not use for commercial services without proper API access
- ❌ Do not share authentication tokens or credentials

**Note:** Excessive usage or violations of OpenAI's terms may result in temporary throttling or account review by OpenAI.

---

## Requirements

- **ChatGPT Plus or Pro subscription** (required)
- **OpenCode** installed ([opencode.ai](https://opencode.ai))

## Troubleshooting

**Common Issues:**

- **401 Unauthorized**: Run `opencode auth login` again
- **Model not found**: Add `openai/` prefix (e.g., `--model=openai/gpt-5-codex-low`)
- **"Item not found" errors**: Update to latest plugin version

**Full troubleshooting guide**: [docs/troubleshooting.md](https://numman-ali.github.io/opencode-openai-codex-auth/troubleshooting)

## Debug Mode

Enable detailed logging:

```bash
DEBUG_CODEX_PLUGIN=1 opencode run "your prompt"
```

For full request/response logs:

```bash
ENABLE_PLUGIN_REQUEST_LOGGING=1 opencode run "your prompt"
```

Logs saved to: `~/.opencode/logs/codex-plugin/`

See [Troubleshooting Guide](https://numman-ali.github.io/opencode-openai-codex-auth/troubleshooting) for details.

## Frequently Asked Questions

### Is this against OpenAI's Terms of Service?

This plugin uses **OpenAI's official OAuth authentication** (the same method as their official Codex CLI). It's designed for personal coding assistance with your own ChatGPT subscription.

However, **users are responsible for ensuring their usage complies with OpenAI's Terms of Use**. This means:
- Personal use for your own development
- Respecting rate limits
- Not reselling access or powering commercial services
- Following OpenAI's acceptable use policies

### Can I use this for my commercial application?

**No.** This plugin is intended for **personal development only**.

For commercial applications, production systems, or services serving multiple users, you must obtain proper API access through the [OpenAI Platform API](https://platform.openai.com/).

### Will my account get banned?

Using OAuth authentication for personal coding assistance aligns with OpenAI's official Codex CLI use case. However, violating OpenAI's terms could result in account action:

**Safe use:**
- Personal coding assistance
- Individual productivity
- Legitimate development work
- Respecting rate limits

**Risky use:**
- Commercial resale of access
- Powering multi-user services
- High-volume automated extraction
- Violating OpenAI's usage policies

### What's the difference between this and scraping session tokens?

**Critical distinction:**
- ✅ **This plugin:** Uses official OAuth authentication through OpenAI's authorization server
- ❌ **Session scraping:** Extracts cookies/tokens from browsers (clearly violates TOS)

OAuth is a **proper, supported authentication method**. Session token scraping and reverse-engineering private APIs are explicitly prohibited by OpenAI's terms.

### Can I use this to avoid paying for the OpenAI API?

**This is not a "free API alternative."**

This plugin allows you to use your **existing ChatGPT subscription** for terminal-based coding assistance (the same use case as OpenAI's official Codex CLI).

If you need API access for applications, automation, or commercial use, you should purchase proper API access from OpenAI Platform.

### Is this affiliated with OpenAI?

**No.** This is an independent open-source project. It uses OpenAI's publicly available OAuth authentication system but is not endorsed, sponsored, or affiliated with OpenAI.

ChatGPT, GPT-5, and Codex are trademarks of OpenAI.

---

## Credits & Attribution

This plugin implements OAuth authentication for OpenAI's Codex backend, using the same authentication flow as:
- [OpenAI's official Codex CLI](https://github.com/openai/codex)
- OpenAI's OAuth authorization server (https://chatgpt.com/oauth)

### Acknowledgments

Based on research and working implementations from:
- [ben-vargas/ai-sdk-provider-chatgpt-oauth](https://github.com/ben-vargas/ai-sdk-provider-chatgpt-oauth)
- [ben-vargas/ai-opencode-chatgpt-auth](https://github.com/ben-vargas/ai-opencode-chatgpt-auth)
- [openai/codex](https://github.com/openai/codex) OAuth flow
- [sst/opencode](https://github.com/sst/opencode)

### Trademark Notice

**Not affiliated with OpenAI.** ChatGPT, GPT-5, GPT-4, GPT-3, Codex, and OpenAI are trademarks of OpenAI, L.L.C. This is an independent open-source project and is not endorsed by, sponsored by, or affiliated with OpenAI.

---

## Documentation

**📖 Documentation:**
- [Installation](#installation) - Get started in 2 minutes
- [Configuration](#configuration) - Customize your setup
- [Troubleshooting](#troubleshooting) - Common issues
- [GitHub Pages Docs](https://numman-ali.github.io/opencode-openai-codex-auth/) - Extended guides
- [Developer Docs](https://numman-ali.github.io/opencode-openai-codex-auth/development/ARCHITECTURE) - Technical deep dive

## License

MIT
