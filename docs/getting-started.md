# Getting Started

Complete installation and setup guide for the OpenCode OpenAI Codex Auth Plugin.

## ⚠️ Before You Begin

**This plugin is for personal development use only.** It uses OpenAI's official OAuth authentication for individual coding assistance with your ChatGPT Plus/Pro subscription.

**Not intended for:** Commercial services, API resale, multi-user applications, or any use that violates [OpenAI's Terms of Use](https://openai.com/policies/terms-of-use/).

For production applications, use the [OpenAI Platform API](https://platform.openai.com/).

---

## Prerequisites

- **OpenCode** installed ([installation guide](https://opencode.ai))
- **ChatGPT Plus or Pro subscription** (required for Codex access)
- **Node.js** 18+ (for OpenCode)

## Installation

### Step 1: Add Plugin to Config

OpenCode automatically installs plugins - no `npm install` needed!

**Choose your configuration style:**

#### ⚠️ REQUIRED: Full Configuration (Only Supported Setup)

**IMPORTANT**: You MUST use the full configuration. This is the ONLY officially supported setup for GPT 5.1 models.

**Why the full config is required:**
- GPT 5 models can be temperamental and need proper configuration
- Minimal configs are NOT supported and will fail unpredictably
- OpenCode features require proper model metadata
- This configuration has been tested and verified to work

Add this to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-openai-codex-auth"],
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
        "gpt-5.1-codex-low": {
          "name": "GPT 5.1 Codex Low (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "low",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-codex-medium": {
          "name": "GPT 5.1 Codex Medium (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "medium",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-codex-high": {
          "name": "GPT 5.1 Codex High (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-codex-max": {
          "name": "GPT 5.1 Codex Max (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-codex-max-low": {
          "name": "GPT 5.1 Codex Max Low (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "low",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-codex-max-medium": {
          "name": "GPT 5.1 Codex Max Medium (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "medium",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-codex-max-high": {
          "name": "GPT 5.1 Codex Max High (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-codex-max-xhigh": {
          "name": "GPT 5.1 Codex Max Extra High (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "xhigh",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-codex-mini-medium": {
          "name": "GPT 5.1 Codex Mini Medium (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "medium",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-codex-mini-high": {
          "name": "GPT 5.1 Codex Mini High (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-low": {
          "name": "GPT 5.1 Low (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "low",
            "reasoningSummary": "auto",
            "textVerbosity": "low",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-medium": {
          "name": "GPT 5.1 Medium (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "medium",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5.1-high": {
          "name": "GPT 5.1 High (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "high",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        }
      }
    }
  }
}
```

  **What you get:**
  - ✅ GPT 5.1 Codex (Low/Medium/High reasoning)
  - ✅ GPT 5.1 Codex Max (Low/Medium/High/xHigh reasoning presets)
  - ✅ GPT 5.1 Codex Mini (Medium/High reasoning)
  - ✅ GPT 5.1 (Low/Medium/High reasoning)
  - ✅ 272k context + 128k output window for all GPT 5.1 presets.
  - ✅ All visible in OpenCode model selector
  - ✅ Optimal settings for each reasoning level

> **Note**: All `gpt-5.1-codex-mini*` presets use 272k context / 128k output limits.
>
> **Note**: Codex Max presets map to the `gpt-5.1-codex-max` slug with 272k context and 128k output. Use `gpt-5.1-codex-max-low/medium/high/xhigh` to pick the reasoning level (only `-xhigh` uses `xhigh` reasoning).

Prompt caching is enabled out of the box: when OpenCode sends its session identifier as `prompt_cache_key`, the plugin forwards it untouched so multi-turn runs reuse prior work. The CODEX_MODE bridge prompt bundled with the plugin is kept in sync with the latest Codex CLI release, so the OpenCode UI and Codex share the same tool contract. If you hit your ChatGPT subscription limits, the plugin returns a friendly Codex-style message with the 5-hour and weekly usage windows so you know when capacity resets.

> **⚠️ CRITICAL:** This full configuration is REQUIRED. OpenCode's context auto-compaction and usage sidebar only work with this full configuration. GPT 5 models are temperamental and need proper setup - minimal configurations are NOT supported.

#### ❌ Minimal Configuration (NOT SUPPORTED - DO NOT USE)

**DO NOT use minimal configurations** - they will NOT work reliably with GPT 5:

```json
// ❌ DO NOT USE THIS
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-openai-codex-auth"],
  "model": "openai/gpt-5-codex"
}
```

**Why this doesn't work:**
- GPT 5 models need proper configuration to work reliably
- Missing model metadata breaks OpenCode features
- Cannot guarantee stable operation

### Step 2: Authenticate

```bash
opencode auth login
```

1. Select **"OpenAI"**
2. Choose **"ChatGPT Plus/Pro (Codex Subscription)"**
3. Browser opens automatically for OAuth flow
4. Log in with your ChatGPT account
5. Done! Token saved to `~/.opencode/auth/openai.json`

**⚠️ Important**: If you have the official Codex CLI running, stop it first (both use port 1455 for OAuth callback).

### Step 3: Test It

```bash
# Quick test
opencode run "write hello world to test.txt" --model=openai/gpt-5.1-codex-medium

# Or start interactive session
opencode
```

You'll see all 13 GPT 5.1 variants (Codex, Codex Max, Codex Mini, and GPT 5.1 presets) in the model selector!

---

## Configuration Locations

OpenCode checks multiple config files in order:

1. **Project config**: `./.opencode.json` (current directory)
2. **Parent configs**: Walks up directory tree
3. **Global config**: `~/.config/opencode/opencode.json`

**Recommendation**: Use global config for plugin, project config for model/agent overrides.

---

## ⚠️ Updating the Plugin (Important!)

**OpenCode does NOT automatically update plugins.**

When a new version is released, you must manually update:

```bash
# Step 1: Clear plugin cache
(cd ~ && sed -i.bak '/"opencode-openai-codex-auth"/d' .cache/opencode/package.json && rm -rf .cache/opencode/node_modules/opencode-openai-codex-auth)

# Step 2: Restart OpenCode - it will reinstall the latest version
opencode
```

**When to update:**
- New features released
- Bug fixes available
- Security updates

**Check for updates**: [Releases Page](https://github.com/numman-ali/opencode-openai-codex-auth/releases)

**Pro tip**: Subscribe to release notifications on GitHub to get notified of updates.

---

## Local Development Setup

For plugin development or testing unreleased changes:

```json
{
  "plugin": ["file:///absolute/path/to/opencode-openai-codex-auth/dist"]
}
```

**Note**: Must point to `dist/` folder (built output), not root.

**Build the plugin:**
```bash
cd opencode-openai-codex-auth
npm install
npm run build
```

---

## Verifying Installation

### Check Plugin is Loaded

```bash
opencode --version
# Should not show any plugin errors
```

### Check Authentication

```bash
cat ~/.opencode/auth/openai.json
# Should show OAuth credentials (if authenticated)
```

### Test API Access

```bash
# Enable logging to verify requests
ENABLE_PLUGIN_REQUEST_LOGGING=1 opencode run "test" --model=openai/gpt-5-codex

# Check logs
ls ~/.opencode/logs/codex-plugin/
# Should show request logs
```

---

## Next Steps

- [Configuration Guide](configuration.md) - Advanced config options
- [Troubleshooting](troubleshooting.md) - Common issues and solutions
- [Developer Docs](development/ARCHITECTURE.md) - Technical deep dive

**Back to**: [Documentation Home](index.md)
