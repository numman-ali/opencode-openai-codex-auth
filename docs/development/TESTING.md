# Complete Test Scenarios

Comprehensive testing matrix for all config scenarios and backwards compatibility.

## Test Scenarios Matrix

### Scenario 1: Default OpenCode Models (No Custom Config)

**Config:**
```json
{
  "plugin": ["opencode-openai-codex-auth"]
}
```

**Available Models:** (from OpenCode's models.dev database)
- `gpt-5`
- `gpt-5-codex`
- `gpt-5-mini`
- `gpt-5-nano`

**Test Cases:**

| User Selects | Plugin Receives | Normalizes To | Config Lookup | API Receives | Result |
|--------------|-----------------|---------------|---------------|--------------|--------|
| `openai/gpt-5` | `"gpt-5"` | `"gpt-5"` | `models["gpt-5"]` → undefined | `"gpt-5"` | ✅ Uses global options |
| `openai/gpt-5-codex` | `"gpt-5-codex"` | `"gpt-5-codex"` | `models["gpt-5-codex"]` → undefined | `"gpt-5-codex"` | ✅ Uses global options |
| `openai/gpt-5-mini` | `"gpt-5-mini"` | `"gpt-5"` | `models["gpt-5-mini"]` → undefined | `"gpt-5"` | ✅ Uses global options |
| `openai/gpt-5-nano` | `"gpt-5-nano"` | `"gpt-5"` | `models["gpt-5-nano"]` → undefined | `"gpt-5"` | ✅ Uses global options |

**Expected Behavior:**
- ✅ All models work with global options
- ✅ Normalized correctly for API
- ✅ No errors

---

### Scenario 2: Custom Config with Preset Names (New Style)

**Config:**
```json
{
  "plugin": ["opencode-openai-codex-auth"],
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "medium"
      },
      "models": {
        "gpt-5-codex-low": {
          "name": "GPT 5 Codex Low (OAuth)",
          "options": { "reasoningEffort": "low" }
        },
        "gpt-5-codex-high": {
          "name": "GPT 5 Codex High (OAuth)",
          "options": { "reasoningEffort": "high" }
        }
      }
    }
  }
}
```

**Test Cases:**

| User Selects | Plugin Receives | Config Lookup | Resolved Options | API Receives | Result |
|--------------|-----------------|---------------|------------------|--------------|--------|
| `openai/gpt-5-codex-low` | `"gpt-5-codex-low"` | Found ✅ | `{ reasoningEffort: "low" }` | `"gpt-5-codex"` | ✅ Per-model |
| `openai/gpt-5-codex-high` | `"gpt-5-codex-high"` | Found ✅ | `{ reasoningEffort: "high" }` | `"gpt-5-codex"` | ✅ Per-model |
| `openai/gpt-5-codex` | `"gpt-5-codex"` | Not found | `{ reasoningEffort: "medium" }` | `"gpt-5-codex"` | ✅ Global |

**Expected Behavior:**
- ✅ Custom variants use per-model options
- ✅ Default `gpt-5-codex` uses global options
- ✅ Both normalize to `"gpt-5-codex"` for API

---

### Scenario 3: Old Config (Backwards Compatibility)

**Config:**
```json
{
  "plugin": ["opencode-openai-codex-auth"],
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "medium"
      },
      "models": {
        "GPT 5 Codex Low (ChatGPT Subscription)": {
          "id": "gpt-5-codex",
          "options": { "reasoningEffort": "low" }
        }
      }
    }
  }
}
```

**Test Cases:**

| User Selects | Plugin Receives | Config Lookup | Resolved Options | API Receives | Result |
|--------------|-----------------|---------------|------------------|--------------|--------|
| `openai/GPT 5 Codex Low (ChatGPT Subscription)` | `"GPT 5 Codex Low (ChatGPT Subscription)"` | Found ✅ | `{ reasoningEffort: "low" }` | `"gpt-5-codex"` | ✅ Per-model |

**Expected Behavior:**
- ✅ Old config keys still work
- ✅ Per-model options applied correctly
- ✅ Normalizes correctly for API

---

### Scenario 4: Mixed Config (Default + Custom)

**Config:**
```json
{
  "plugin": ["opencode-openai-codex-auth"],
  "provider": {
    "openai": {
      "models": {
        "gpt-5-codex-low": {
          "name": "GPT 5 Codex Low (OAuth)",
          "options": { "reasoningEffort": "low" }
        }
      }
    }
  }
}
```

**Available Models:**
- `gpt-5-codex-low` (custom)
- `gpt-5-codex` (default from models.dev)
- `gpt-5` (default from models.dev)

**Test Cases:**

| User Selects | Config Lookup | Uses Options | Result |
|--------------|---------------|--------------|--------|
| `openai/gpt-5-codex-low` | Found ✅ | Per-model | ✅ Custom config |
| `openai/gpt-5-codex` | Not found | Global | ✅ Default model |
| `openai/gpt-5` | Not found | Global | ✅ Default model |

**Expected Behavior:**
- ✅ Custom variants use per-model options
- ✅ Default models use global options
- ✅ Both types coexist peacefully

---

### Scenario 5: Edge Cases

#### 5a: Model Name with Uppercase

**Config:**
```json
{
  "models": {
    "GPT-5-CODEX-HIGH": {
      "options": { "reasoningEffort": "high" }
    }
  }
}
```

**Test:**
```
User selects: openai/GPT-5-CODEX-HIGH
Plugin receives: "GPT-5-CODEX-HIGH"
normalizeModel: "GPT-5-CODEX-HIGH" → "gpt-5-codex" ✅ (includes "codex")
Config lookup: models["GPT-5-CODEX-HIGH"] → Found ✅
API receives: "gpt-5-codex" ✅
```

**Result:** ✅ Works (case-insensitive includes())

---

#### 5b: Model Name with Special Characters

**Config:**
```json
{
  "models": {
    "my-gpt5-codex-variant": {
      "options": { "reasoningEffort": "high" }
    }
  }
}
```

**Test:**
```
User selects: openai/my-gpt5-codex-variant
Plugin receives: "my-gpt5-codex-variant"
normalizeModel: "my-gpt5-codex-variant" → "gpt-5-codex" ✅ (includes "codex")
Config lookup: models["my-gpt5-codex-variant"] → Found ✅
API receives: "gpt-5-codex" ✅
```

**Result:** ✅ Works (normalization handles it)

---

#### 5c: No Config, No Model Specified

**Config:**
```json
{
  "plugin": ["opencode-openai-codex-auth"]
}
```

**Test:**
```
User selects: (none - uses OpenCode default)
Plugin receives: undefined or default from OpenCode
normalizeModel: undefined → "gpt-5" ✅ (fallback)
Config lookup: models[undefined] → undefined
API receives: "gpt-5" ✅
```

**Result:** ✅ Works (safe fallback)

---

#### 5d: Only `gpt-5` in Name (No `codex`)

**Config:**
```json
{
  "models": {
    "my-gpt-5-variant": {
      "options": { "reasoningEffort": "high" }
    }
  }
}
```

**Test:**
```
User selects: openai/my-gpt-5-variant
Plugin receives: "my-gpt-5-variant"
normalizeModel: "my-gpt-5-variant" → "gpt-5" ✅ (includes "gpt-5", not "codex")
Config lookup: models["my-gpt-5-variant"] → Found ✅
API receives: "gpt-5" ✅
```

**Result:** ✅ Works (correct model selected)

---

### Scenario 6: Multi-Turn Conversation (store:false Test)

**Config:** Any

**Test Sequence:**
```
Turn 1: > write hello to test.txt
Turn 2: > read the file
Turn 3: > what did you write?
Turn 4: > now delete it
```

**What Plugin Should Do:**

| Turn | Input Has IDs? | Filter Result | Encrypted Content | Result |
|------|---------------|---------------|-------------------|--------|
| 1 | No | No filtering needed | Received in response | ✅ Works |
| 2 | Yes (from Turn 1) | ALL removed ✅ | Sent back in request | ✅ Works |
| 3 | Yes (from Turn 1-2) | ALL removed ✅ | Sent back in request | ✅ Works |
| 4 | Yes (from Turn 1-3) | ALL removed ✅ | Sent back in request | ✅ Works |

**Expected Behavior:**
- ✅ No "item not found" errors on any turn
- ✅ Context preserved via encrypted reasoning
- ✅ Debug log shows: "Successfully removed all X message IDs"

---

## Backwards Compatibility Testing

### Test Matrix

| Plugin Version | Config Format | Expected Result |
|----------------|--------------|-----------------|
| **Old (<2.1.2)** | Long names + id | ❌ Per-model options broken, ID errors |
| **Old (<2.1.2)** | Short names | ❌ Per-model options broken, ID errors |
| **New (2.1.2+)** | Long names + id | ✅ **ALL FIXED** |
| **New (2.1.2+)** | Short names | ✅ **ALL FIXED** |
| **New (2.1.2+)** | Short names (no id) | ✅ **OPTIMAL** |

### Backwards Compatibility Tests

#### Test 1: Old Plugin User Upgrades

**Before (Plugin v2.1.1):**
```json
{
  "models": {
    "GPT 5 Codex Low (ChatGPT Subscription)": {
      "id": "gpt-5-codex",
      "options": { "reasoningEffort": "low" }
    }
  }
}
```

**After (Plugin v2.1.2):**
- Keep same config
- Plugin now finds per-model options ✅
- No "item not found" errors ✅

**Result:** ✅ **Works without config changes**

---

#### Test 2: New User with Recommended Config

**Config:**
```json
{
  "models": {
    "gpt-5-codex-low": {
      "name": "GPT 5 Codex Low (OAuth)",
      "options": { "reasoningEffort": "low" }
    }
  }
}
```

**Expected:**
- CLI: `--model=openai/gpt-5-codex-low` ✅
- TUI: Shows "GPT 5 Codex Low (OAuth)" ✅
- Plugin: Finds and applies per-model options ✅
- API: Receives `"gpt-5-codex"` ✅

**Result:** ✅ **Optimal experience**

---

#### Test 3: Minimal Config (No Custom Models)

**Config:**
```json
{
  "plugin": ["opencode-openai-codex-auth"],
  "model": "openai/gpt-5-codex"
}
```

**Expected:**
- Uses default OpenCode model: `gpt-5-codex`
- Plugin applies: Global options + Codex defaults
- No errors ✅

**Result:** ✅ **Works out of the box**

---

## Debug Logging Test Cases

### Enable Debug Mode

```bash
DEBUG_CODEX_PLUGIN=1 opencode run "test" --model=openai/gpt-5-codex-low
```

### Expected Debug Output

#### Case 1: Custom Model with Config

```
[openai-codex-plugin] Debug logging ENABLED
[openai-codex-plugin] Model config lookup: "gpt-5-codex-low" → normalized to "gpt-5-codex" for API {
  hasModelSpecificConfig: true,
  resolvedConfig: {
    reasoningEffort: 'low',
    textVerbosity: 'medium',
    reasoningSummary: 'auto',
    include: ['reasoning.encrypted_content']
  }
}
[openai-codex-plugin] Filtering 0 message IDs from input: []
```

✅ **Verify:** `hasModelSpecificConfig: true` confirms per-model options found

---

#### Case 2: Default Model (No Custom Config)

```bash
DEBUG_CODEX_PLUGIN=1 opencode run "test" --model=openai/gpt-5-codex
```

```
[openai-codex-plugin] Debug logging ENABLED
[openai-codex-plugin] Model config lookup: "gpt-5-codex" → normalized to "gpt-5-codex" for API {
  hasModelSpecificConfig: false,
  resolvedConfig: {
    reasoningEffort: 'medium',
    textVerbosity: 'medium',
    reasoningSummary: 'auto',
    include: ['reasoning.encrypted_content']
  }
}
[openai-codex-plugin] Filtering 0 message IDs from input: []
```

✅ **Verify:** `hasModelSpecificConfig: false` confirms using global options

---

#### Case 3: Multi-Turn with ID Filtering

```
[openai-codex-plugin] Filtering 3 message IDs from input: ['msg_abc123', 'rs_xyz789', 'msg_def456']
[openai-codex-plugin] Successfully removed all 3 message IDs
```

✅ **Verify:** All IDs removed, no warnings

---

#### Case 4: Warning if IDs Leak (Should Never Happen)

```
[openai-codex-plugin] WARNING: 1 IDs still present after filtering: ['msg_abc123']
```

❌ **This would indicate a bug** - should never appear

---

## Integration Test Plan

### Manual Testing Procedure

#### Step 1: Fresh Install Test

```bash
# 1. Clear cache
(cd ~ && rm -rf .cache/opencode/node_modules/opencode-openai-codex-auth)

# 2. Use minimal config
cat > ~/.config/opencode/opencode.json <<'EOF'
{
  "plugin": ["opencode-openai-codex-auth"],
  "model": "openai/gpt-5-codex"
}
EOF

# 3. Test default model
DEBUG_CODEX_PLUGIN=1 opencode run "write hello world to test.txt"
```

**Verify:**
- ✅ Plugin installs automatically
- ✅ Auth works
- ✅ Debug log shows: `hasModelSpecificConfig: false`
- ✅ Model normalizes to `"gpt-5-codex"`
- ✅ No errors

---

#### Step 2: Custom Config Test

```bash
# Update config with custom models
cat > ~/.config/opencode/opencode.json <<'EOF'
{
  "plugin": ["opencode-openai-codex-auth"],
  "provider": {
    "openai": {
      "models": {
        "gpt-5-codex-low": {
          "name": "GPT 5 Codex Low (OAuth)",
          "options": { "reasoningEffort": "low" }
        },
        "gpt-5-codex-high": {
          "name": "GPT 5 Codex High (OAuth)",
          "options": { "reasoningEffort": "high" }
        }
      }
    }
  }
}
EOF

# Test per-model options
DEBUG_CODEX_PLUGIN=1 opencode run "test low" --model=openai/gpt-5-codex-low
DEBUG_CODEX_PLUGIN=1 opencode run "test high" --model=openai/gpt-5-codex-high
```

**Verify:**
- ✅ Debug log shows: `hasModelSpecificConfig: true` for both
- ✅ Different `reasoningEffort` values in logs
- ✅ TUI shows friendly names

---

#### Step 3: Multi-Turn Test (Critical for store:false)

```bash
DEBUG_CODEX_PLUGIN=1 opencode --model=openai/gpt-5-codex-medium
```

```
> write "test content" to file1.txt
> read file1.txt
> what did you just write?
> create file2.txt with different content
> compare the two files
```

**Verify:**
- ✅ No "item not found" errors on ANY turn
- ✅ Debug shows IDs removed on turns 2+
- ✅ Context is maintained across turns
- ✅ All tool calls work correctly

---

#### Step 4: Model Switching Test

```bash
DEBUG_CODEX_PLUGIN=1 opencode
```

```
> /model openai/gpt-5-codex-low
> write hello to test.txt
> /model openai/gpt-5-codex-high
> write goodbye to test2.txt
```

**Verify:**
- ✅ Different reasoning efforts logged for each model
- ✅ Per-model options applied correctly
- ✅ No errors when switching

---

#### Step 5: TUI Persistence Test

```bash
# 1. Start opencode
opencode --model=openai/gpt-5-codex-high

# 2. Run a command
> write test

# 3. Exit (ctrl+c)

# 4. Restart
opencode

# 5. Check which model is selected
> /model
```

**Verify:**
- ✅ Last used model is `gpt-5-codex-high`
- ✅ Model is auto-selected on restart
- ✅ TUI shows correct model highlighted

---

## Normalization Edge Cases

### Test: normalizeModel() Coverage

```typescript
normalizeModel("gpt-5-codex")          // → "gpt-5-codex" ✅
normalizeModel("gpt-5-codex-low")      // → "gpt-5-codex" ✅
normalizeModel("GPT-5-CODEX-HIGH")     // → "gpt-5-codex" ✅
normalizeModel("gpt-5-codex-mini-high")// → "gpt-5-codex-mini" ✅
normalizeModel("codex-mini-latest")    // → "gpt-5-codex-mini" ✅ (legacy alias)
normalizeModel("my-codex-model")       // → "gpt-5-codex" ✅
normalizeModel("gpt-5")                // → "gpt-5" ✅
normalizeModel("gpt-5-mini")           // → "gpt-5" ✅
normalizeModel("gpt-5-nano")           // → "gpt-5" ✅
normalizeModel("GPT 5 High")           // → "gpt-5" ✅
normalizeModel(undefined)              // → "gpt-5" ✅
normalizeModel("random-model")         // → "gpt-5" ✅ (fallback)
```

**Implementation:**
```typescript
export function normalizeModel(model: string | undefined): string {
  if (!model) return "gpt-5";
  const normalized = model.toLowerCase();
  if (
    normalized.includes("codex-mini") ||
    normalized.includes("gpt-5-codex-mini") ||
    normalized.includes("codex-mini-latest")
  ) {
    return "gpt-5-codex-mini";
  }
  if (normalized.includes("codex")) {
    return "gpt-5-codex";
  }
  if (normalized.includes("gpt-5") || normalized.includes("gpt 5")) {
    return "gpt-5";
  }
  return "gpt-5";
}
```

**Why this works:**
- ✅ Case-insensitive (`.toLowerCase()` + `.includes()`)
- ✅ Pattern-based (works with any naming)
- ✅ Safe fallback (unknown models → `gpt-5`)
- ✅ Codex priority with explicit Codex Mini support (`codex-mini*` → `gpt-5-codex-mini`, legacy `codex-mini-latest` still works)

---

## Expected Failures (These Should Error)

### Invalid Model Selection

```bash
opencode run "test" --model=openai/claude-3.5
```

**Expected:** ❌ Error before plugin (OpenCode rejects unknown model)

### Missing Authentication

```bash
# Without running: opencode auth login
opencode run "test" --model=openai/gpt-5-codex
```

**Expected:** ❌ 401 Unauthorized error

---

## Success Criteria

### All Tests Must Pass

- [ ] Default models work without custom config
- [ ] Custom config variants use per-model options
- [ ] Old config format still works (backwards compat)
- [ ] Mixed default + custom models work
- [ ] Multi-turn conversations have no ID errors
- [ ] Model switching works correctly
- [ ] TUI persistence remembers last used model
- [ ] Debug logging shows correct information
- [ ] All normalization edge cases work

### No Errors

- [ ] No "item not found" errors
- [ ] No TypeScript errors
- [ ] No authentication errors (after login)
- [ ] No config validation errors

---

## Automated Test Suggestions

### Unit Tests (Future)

```typescript
describe('normalizeModel', () => {
  test('handles all default models', () => {
    expect(normalizeModel('gpt-5')).toBe('gpt-5')
    expect(normalizeModel('gpt-5-codex')).toBe('gpt-5-codex')
    expect(normalizeModel('gpt-5-codex-mini')).toBe('gpt-5-codex-mini')
    expect(normalizeModel('gpt-5-mini')).toBe('gpt-5')
    expect(normalizeModel('gpt-5-nano')).toBe('gpt-5')
  })

  test('handles custom preset names', () => {
    expect(normalizeModel('gpt-5-codex-low')).toBe('gpt-5-codex')
    expect(normalizeModel('openai/gpt-5-codex-mini-high')).toBe('gpt-5-codex-mini')
    expect(normalizeModel('gpt-5-high')).toBe('gpt-5')
  })

  test('handles legacy names', () => {
    expect(normalizeModel('GPT 5 Codex Low (ChatGPT Subscription)')).toBe('gpt-5-codex')
  })

  test('handles edge cases', () => {
    expect(normalizeModel(undefined)).toBe('gpt-5')
    expect(normalizeModel('codex-mini-latest')).toBe('gpt-5-codex-mini')
    expect(normalizeModel('random')).toBe('gpt-5')
  })
})

describe('getModelConfig', () => {
  test('returns per-model options when found', () => {
    const config = getModelConfig('gpt-5-codex-low', {
      global: { reasoningEffort: 'medium' },
      models: {
        'gpt-5-codex-low': {
          options: { reasoningEffort: 'low' }
        }
      }
    })
    expect(config.reasoningEffort).toBe('low')
  })

  test('returns global options when model not in config', () => {
    const config = getModelConfig('gpt-5-codex', {
      global: { reasoningEffort: 'medium' },
      models: {}
    })
    expect(config.reasoningEffort).toBe('medium')
  })
})

describe('filterInput', () => {
  test('removes all message IDs', () => {
    const input = [
      { id: 'msg_123', role: 'user', content: [] },
      { id: 'rs_456', role: 'assistant', content: [] },
      { role: 'user', content: [] }  // No ID
    ]
    const result = filterInput(input)
    expect(result.every(item => !item.id)).toBe(true)
  })
})
```

---

## See Also

- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Complete summary
- [CONFIG_FIELDS.md](./CONFIG_FIELDS.md) - Field usage guide
- [BUGS_FIXED.md](./BUGS_FIXED.md) - Bug analysis
