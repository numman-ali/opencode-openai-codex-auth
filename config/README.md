# Configuration

This directory contains the official opencode configuration for the OpenAI Codex OAuth plugin.

## ⚠️ REQUIRED Configuration File

### full-opencode.json (REQUIRED - USE THIS ONLY)

**YOU MUST use this configuration file** - it is the ONLY officially supported setup:

```bash
cp config/full-opencode.json ~/.config/opencode/opencode.json
```

**Why this is required:**
- GPT 5 models can be temperamental and need proper configuration
- Contains 12+ verified GPT 5.1 model variants (Codex, Codex Max, Codex Mini, and general GPT 5.1 including `gpt-5.1-codex-max-low/medium/high/xhigh`)
- Includes all required metadata for OpenCode features
- Guaranteed to work reliably
- Global options for all models + per-model configuration overrides

**What's included:**
- All supported GPT 5.1 variants: gpt-5.1, gpt-5.1-codex, gpt-5.1-codex-max, gpt-5.1-codex-mini
- Proper reasoning effort settings for each variant (including new `xhigh` for Codex Max)
- Context limits (272k context / 128k output for all Codex families, including Codex Max)
- Required options: `store: false`, `include: ["reasoning.encrypted_content"]`

### ❌ Other Configurations (NOT SUPPORTED)

**DO NOT use:**
- `minimal-opencode.json` - NOT supported, will fail unpredictably
- `full-opencode-gpt5.json` - DEPRECATED, GPT 5.0 models are being phased out by OpenAI
- Custom configurations - NOT recommended, may not work reliably

**Why other configs don't work:**
- GPT 5 models need specific configurations
- Missing metadata breaks OpenCode features
- No support for usage limits or context compaction
- Cannot guarantee stable operation

## Usage

**ONLY ONE OPTION** - use the full configuration:

1. Copy `full-opencode.json` to your opencode config directory:
   - Global: `~/.config/opencode/opencode.json`
   - Project: `<project>/.opencode.json`

2. **DO NOT modify** the configuration unless you know exactly what you're doing. The provided settings have been tested and verified to work.

3. Run opencode: `opencode run "your prompt" --model=openai/gpt-5.1-codex-medium`

> **⚠️ Critical**: GPT 5 models require this exact configuration. Do not use minimal configs or create custom variants - they are not supported and will fail unpredictably.

## Configuration Options

See the main [README.md](../README.md#configuration) for detailed documentation of all configuration options.

**Remember**: Use `full-opencode.json` as-is for guaranteed compatibility. Custom configurations are not officially supported.
