#!/bin/bash

# Test All Models - Verify API Configuration
# This script tests all model configurations and verifies the actual API requests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPENCODE_JSON="${REPO_DIR}/opencode.json"
LOG_DIR="${HOME}/.opencode/logs/codex-plugin"
RESULTS_FILE="${REPO_DIR}/test-results.md"

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Model Configuration Verification Test Suite${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

# Kill any running OpenCode server processes to force fresh plugin load
echo "Killing OpenCode server processes..."
pkill -f "opencode" 2>/dev/null || true
sleep 2
echo "✓ OpenCode servers stopped"
echo ""

# Initialize results file
cat > "${RESULTS_FILE}" << 'EOF'
# Model Configuration Verification Results

**Test Date:** $(date)
**Test Directory:** Repository local config

## Results Summary

| Model | Normalized | Family | Effort | Summary | Verbosity | Include | Status |
|-------|------------|--------|--------|---------|-----------|---------|--------|
EOF

# Function: Run a test for a specific model
test_model() {
    local model_name="$1"
    local expected_normalized="$2"
    local expected_family="$3"
    local expected_effort="$4"
    local expected_summary="$5"
    local expected_verbosity="$6"

    ((TOTAL_TESTS++))

    echo -e "${YELLOW}Testing model: ${model_name}${NC}"

    # Clear previous logs
    rm -rf "${LOG_DIR}"/*

    # Run opencode
    cd "${REPO_DIR}"
    if ENABLE_PLUGIN_REQUEST_LOGGING=1 DEBUG_CODEX_PLUGIN=1 opencode run "write hello to test-${TOTAL_TESTS}.txt" --model="openai/${model_name}" > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Command executed successfully${NC}"
    else
        echo -e "${RED}  ✗ Command failed${NC}"
        echo "| ${model_name} | N/A | N/A | N/A | N/A | N/A | ❌ FAILED |" >> "${RESULTS_FILE}"
        ((FAILED_TESTS++))
        return 1
    fi

    # Find the after-transform log file that matches the expected model
    # (opencode may use multiple models per session - e.g., nano for titles)
    local log_file=""
    for f in $(find "${LOG_DIR}" -name "*-after-transform.json" -type f -print0 | xargs -0 ls -t); do
        local orig_model=$(jq -r '.originalModel // ""' "$f" 2>/dev/null)
        if [ "${orig_model}" = "${model_name}" ]; then
            log_file="$f"
            break
        fi
    done

    if [ -z "${log_file}" ] || [ ! -f "${log_file}" ]; then
        echo -e "${RED}  ✗ Log file not found for model ${model_name}${NC}"
        echo "| ${model_name} | N/A | N/A | N/A | N/A | N/A | ❌ NO LOG |" >> "${RESULTS_FILE}"
        ((FAILED_TESTS++))
        return 1
    fi

    # Parse log file with jq
    local actual_normalized=$(jq -r '.normalizedModel // "N/A"' "${log_file}")
    local actual_family=$(jq -r '.modelFamily // "N/A"' "${log_file}")
    local actual_effort=$(jq -r '.reasoning.effort // "N/A"' "${log_file}")
    local actual_summary=$(jq -r '.reasoning.summary // "N/A"' "${log_file}")
    local actual_verbosity=$(jq -r '.body.text.verbosity // "N/A"' "${log_file}")
    local actual_include=$(jq -r '.include[0] // "N/A"' "${log_file}")

    echo "  Actual: model=${actual_normalized}, family=${actual_family}, effort=${actual_effort}, summary=${actual_summary}, verbosity=${actual_verbosity}"
    echo "  Expected: model=${expected_normalized}, family=${expected_family}, effort=${expected_effort}, summary=${expected_summary}, verbosity=${expected_verbosity}"

    # Verify values
    local status="✅ PASS"
    if [ "${actual_normalized}" != "${expected_normalized}" ] || \
       [ "${actual_family}" != "${expected_family}" ] || \
       [ "${actual_effort}" != "${expected_effort}" ] || \
       [ "${actual_summary}" != "${expected_summary}" ] || \
       [ "${actual_verbosity}" != "${expected_verbosity}" ]; then
        status="❌ FAIL"
        ((FAILED_TESTS++))
        echo -e "${RED}  ✗ Verification failed${NC}"
    else
        ((PASSED_TESTS++))
        echo -e "${GREEN}  ✓ Verification passed${NC}"
    fi

    # Add to results
    echo "| ${model_name} | ${actual_normalized} | ${actual_family} | ${actual_effort} | ${actual_summary} | ${actual_verbosity} | ${actual_include} | ${status} |" >> "${RESULTS_FILE}"

    # Cleanup
    rm -f "${REPO_DIR}/test-${TOTAL_TESTS}.txt"

    echo ""
}

# Function: Update opencode.json with config
update_config() {
    local config_type="$1"

    echo -e "${BLUE}─────────────────────────────────────────────────────────────────${NC}"
    echo -e "${BLUE}Scenario: ${config_type}${NC}"
    echo -e "${BLUE}─────────────────────────────────────────────────────────────────${NC}"
    echo ""

    case "${config_type}" in
        "full")
            cat "${REPO_DIR}/config/full-opencode.json" > "${OPENCODE_JSON}"
            echo "✓ Updated opencode.json with full config (GPT 5.1)"
            ;;
        "minimal")
            cat "${REPO_DIR}/config/minimal-opencode.json" > "${OPENCODE_JSON}"
            echo "✓ Updated opencode.json with minimal config"
            ;;
        "backwards-compat")
            cat "${REPO_DIR}/config/full-opencode-gpt5.json" > "${OPENCODE_JSON}"
            echo "✓ Updated opencode.json with backwards compatibility config"
            ;;
    esac

    # Replace npm package with local dist for testing
    sed -i.bak 's|"opencode-openai-codex-auth@[^"]*"|"file://'"${REPO_DIR}"'/dist"|' "${OPENCODE_JSON}"
    rm -f "${OPENCODE_JSON}.bak"
    echo "✓ Using local dist for plugin"

    echo ""
}

# ============================================================================
# Scenario 1: Full Config - GPT 5.1 Model Family
# ============================================================================
update_config "full"

# GPT 5.1 Codex presets
test_model "gpt-5.1-codex-low"        "gpt-5.1-codex"       "codex"      "low"     "auto"     "medium"
test_model "gpt-5.1-codex-medium"     "gpt-5.1-codex"       "codex"      "medium"  "auto"     "medium"
test_model "gpt-5.1-codex-high"       "gpt-5.1-codex"       "codex"      "high"    "detailed" "medium"
test_model "gpt-5.1-codex-max-low"    "gpt-5.1-codex-max"   "codex-max"  "low"     "detailed" "medium"
test_model "gpt-5.1-codex-max-medium" "gpt-5.1-codex-max"   "codex-max"  "medium"  "detailed" "medium"
test_model "gpt-5.1-codex-max-high"   "gpt-5.1-codex-max"   "codex-max"  "high"    "detailed" "medium"
test_model "gpt-5.1-codex-max-xhigh"  "gpt-5.1-codex-max"   "codex-max"  "xhigh"   "detailed" "medium"

# GPT 5.2 presets (supports none/low/medium/high/xhigh per OpenAI API docs)
 test_model "gpt-5.2-none"   "gpt-5.2"   "gpt-5.2"  "none"    "auto"     "medium"
 test_model "gpt-5.2-low"    "gpt-5.2"   "gpt-5.2"  "low"     "auto"     "medium"
 test_model "gpt-5.2-medium" "gpt-5.2"   "gpt-5.2"  "medium"  "auto"     "medium"
 test_model "gpt-5.2-high"   "gpt-5.2"   "gpt-5.2"  "high"    "detailed" "medium"
 test_model "gpt-5.2-xhigh"  "gpt-5.2"   "gpt-5.2"  "xhigh"   "detailed" "medium"
 
 # GPT 5.2 Codex presets
 test_model "gpt-5.2-codex-low"    "gpt-5.2-codex" "gpt-5.2-codex" "low"    "detailed" "medium"
 test_model "gpt-5.2-codex-medium" "gpt-5.2-codex" "gpt-5.2-codex" "medium" "detailed" "medium"
 test_model "gpt-5.2-codex-high"   "gpt-5.2-codex" "gpt-5.2-codex" "high"   "detailed" "medium"
 test_model "gpt-5.2-codex-xhigh"  "gpt-5.2-codex" "gpt-5.2-codex" "xhigh"  "detailed" "medium"
 
 # GPT 5.1 Codex Mini presets (medium/high only)
test_model "gpt-5.1-codex-mini-medium" "gpt-5.1-codex-mini" "codex"      "medium"  "auto"     "medium"
test_model "gpt-5.1-codex-mini-high"   "gpt-5.1-codex-mini" "codex"      "high"    "detailed" "medium"

# GPT 5.1 general-purpose presets (supports none/low/medium/high per OpenAI API docs)
test_model "gpt-5.1-none"          "gpt-5.1"       "gpt-5.1"    "none"    "auto"     "medium"
test_model "gpt-5.1-low"           "gpt-5.1"       "gpt-5.1"    "low"     "auto"     "low"
test_model "gpt-5.1-medium"        "gpt-5.1"       "gpt-5.1"    "medium"  "auto"     "medium"
test_model "gpt-5.1-high"          "gpt-5.1"       "gpt-5.1"    "high"    "detailed" "high"

# # ============================================================================
# # Scenario 2: Minimal Config - Default Models (No Custom Config)
# # ============================================================================
# update_config "minimal"

# test_model "gpt-5"       "gpt-5"       "medium"  "auto" "medium"
# test_model "gpt-5-codex" "gpt-5-codex" "medium"  "auto" "medium"
# test_model "gpt-5-mini"  "gpt-5"       "minimal" "auto" "medium"
# test_model "gpt-5-nano"  "gpt-5"       "minimal" "auto" "medium"

# ============================================================================
# Scenario 3: Backwards Compatibility
# ============================================================================
# update_config "backwards-compat"

# # GPT 5 Codex presets
# test_model "gpt-5-codex-low" "gpt-5-codex" "low" "auto" "medium"
# test_model "gpt-5-codex-medium" "gpt-5-codex" "medium" "auto" "medium"
# test_model "gpt-5-codex-high" "gpt-5-codex" "high" "detailed" "medium"

# GPT 5 Codex Mini presets
# test_model "gpt-5-codex-mini" "codex-mini-latest" "medium" "auto" "medium"
# test_model "gpt-5-codex-mini-medium" "codex-mini-latest" "medium" "auto" "medium"
# test_model "gpt-5-codex-mini-high" "codex-mini-latest" "high" "detailed" "medium"

# GPT 5 general-purpose presets
# test_model "gpt-5" "gpt-5" "medium" "auto" "medium"
# test_model "gpt-5-medium" "gpt-5" "medium" "auto" "medium"
# test_model "gpt-5-high" "gpt-5" "high" "detailed" "high"
# test_model "gpt-5-mini" "gpt-5" "minimal" "auto" "medium"

# ============================================================================
# Summary
# ============================================================================
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Test Results Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Total Tests:  ${TOTAL_TESTS}"
echo -e "${GREEN}Passed:       ${PASSED_TESTS}${NC}"
if [ ${FAILED_TESTS} -gt 0 ]; then
    echo -e "${RED}Failed:       ${FAILED_TESTS}${NC}"
else
    echo -e "Failed:       ${FAILED_TESTS}"
fi
echo ""
echo -e "Results saved to: ${RESULTS_FILE}"
echo ""

# Restore original config
if [ -f "${REPO_DIR}/config/full-opencode.json" ]; then
    cat "${REPO_DIR}/config/full-opencode.json" > "${OPENCODE_JSON}"
    echo "✓ Restored original full config to opencode.json"
fi

# Exit with appropriate code
if [ ${FAILED_TESTS} -gt 0 ]; then
    exit 1
else
    exit 0
fi
