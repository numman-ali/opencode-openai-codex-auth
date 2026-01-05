# Test Suite

This directory contains the test suite for the OpenAI Codex OAuth plugin.

## Test Structure

```
test/
├── README.md                      # This file
├── accounts.test.ts               # Multi-account storage/rotation tests
├── auth.test.ts                   # OAuth authentication tests
├── browser.test.ts                # Platform-specific browser open behavior
├── codex.test.ts                  # Codex prompt/instructions behavior
├── config.test.ts                 # Configuration parsing/merging tests
├── fetch-helpers.test.ts          # Fetch flow helper tests
├── logger.test.ts                 # Logging functionality tests
├── plugin-config.test.ts          # Plugin config defaults + overrides
├── request-transformer.test.ts    # Request transformation tests
└── response-handler.test.ts       # Response handling tests
```

## Running Tests

```bash
# Run all tests once
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# Visual test UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Test Coverage

### auth.test.ts
Tests OAuth authentication functionality:
- State generation and uniqueness
- Authorization input parsing (URL, code#state, query string formats)
- JWT decoding and payload extraction
- Authorization flow creation with PKCE
- URL parameter validation

### accounts.test.ts
Tests multi-account behavior:
- Account seeding from fallback auth
- Account rotation when rate-limited
- Cooldown handling for transient failures

### config.test.ts + plugin-config.test.ts
Tests configuration parsing and merging:
- Global configuration application
- Per-model configuration overrides
- Default values and fallbacks
- Reasoning effort normalization (e.g. minimal → low for Codex families)
- Model-family detection and prompt selection

### request-transformer.test.ts
Tests request body transformations:
- Model name normalization
- Input filtering (stateless operation)
- Bridge/tool-remap message injection
- Reasoning configuration application
- Unsupported parameter removal

### response-handler.test.ts
Tests SSE to JSON conversion:
- Content-type header management
- SSE stream parsing (response.done, response.completed)
- Malformed JSON handling
- Empty stream handling
- Status preservation

### fetch-helpers.test.ts
Tests focused helpers used in the 7-step fetch flow:
- URL rewriting
- Header construction
- Body normalization
- Request/response edge cases

### logger.test.ts
Tests logging behavior:
- Environment-gated request logging
- Parameter handling

### browser.test.ts
Tests browser opening behavior across platforms.

### codex.test.ts
Tests Codex instructions/prompt behaviors and caching paths.

## Test Philosophy

1. **Comprehensive Coverage**: Tests cover normal cases, edge cases, and error conditions
2. **Fast Execution**: Unit tests should remain fast and deterministic
3. **No External Dependencies**: Tests avoid real network calls
4. **Type Safety**: All tests are TypeScript with strict type checking

## CI/CD Integration

Tests automatically run in GitHub Actions on:
- Every push to main
- Every pull request

The CI workflow currently tests against Node.js versions (20.x, 22.x).

## Adding New Tests

When adding new functionality:

1. Create or update the relevant test file
2. Follow the existing pattern using vitest's `describe` and `it` blocks
3. Keep tests isolated and independent of external state
4. Run `npm test` to verify all tests pass
5. Run `npm run typecheck` to ensure TypeScript types are correct

## Example Configurations

See the `config/` directory for working configuration examples:
- `opencode-legacy.json`: Legacy complete example with all model variants
- `opencode-modern.json`: Variant-based example for OpenCode v1.0.210+
