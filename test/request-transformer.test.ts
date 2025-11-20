import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    normalizeModel,
    getModelConfig,
    filterInput,
    addToolRemapMessage,
    isOpenCodeSystemPrompt,
    filterOpenCodeSystemPrompts,
    addCodexBridgeMessage,
    transformRequestBody,
} from '../lib/request/request-transformer.js';
import { TOOL_REMAP_MESSAGE } from '../lib/prompts/codex.js';
import { CODEX_OPENCODE_BRIDGE } from '../lib/prompts/codex-opencode-bridge.js';
import type { RequestBody, UserConfig, InputItem } from '../lib/types.js';

describe('Request Transformer Module', () => {
	describe('normalizeModel', () => {
		it('should normalize gpt-5-codex', async () => {
			expect(normalizeModel('gpt-5-codex')).toBe('gpt-5-codex');
		});

		it('should normalize gpt-5', async () => {
			expect(normalizeModel('gpt-5')).toBe('gpt-5');
		});

		it('should normalize variants containing "codex"', async () => {
			expect(normalizeModel('openai/gpt-5-codex')).toBe('gpt-5-codex');
			expect(normalizeModel('custom-gpt-5-codex-variant')).toBe('gpt-5-codex');
		});

		it('should normalize variants containing "gpt-5"', async () => {
			expect(normalizeModel('gpt-5-mini')).toBe('gpt-5');
			expect(normalizeModel('gpt-5-nano')).toBe('gpt-5');
		});

		it('should return gpt-5 as default for unknown models', async () => {
			expect(normalizeModel('unknown-model')).toBe('gpt-5');
			expect(normalizeModel('gpt-4')).toBe('gpt-5');
		});

		it('should return gpt-5 for undefined', async () => {
			expect(normalizeModel(undefined)).toBe('gpt-5');
		});

		// NEW: Codex CLI preset name tests
		describe('Codex CLI preset names', () => {
			it('should normalize all gpt-5-codex presets to gpt-5-codex', async () => {
				expect(normalizeModel('gpt-5-codex-low')).toBe('gpt-5-codex');
				expect(normalizeModel('gpt-5-codex-medium')).toBe('gpt-5-codex');
				expect(normalizeModel('gpt-5-codex-high')).toBe('gpt-5-codex');
			});

			it('should normalize all gpt-5 presets to gpt-5', async () => {
				expect(normalizeModel('gpt-5-minimal')).toBe('gpt-5');
				expect(normalizeModel('gpt-5-low')).toBe('gpt-5');
				expect(normalizeModel('gpt-5-medium')).toBe('gpt-5');
				expect(normalizeModel('gpt-5-high')).toBe('gpt-5');
			});

			it('should prioritize codex over gpt-5 in model name', async () => {
				// Model name contains BOTH "codex" and "gpt-5"
				// Should return "gpt-5-codex" (codex checked first)
				expect(normalizeModel('gpt-5-codex-low')).toBe('gpt-5-codex');
				expect(normalizeModel('my-gpt-5-codex-model')).toBe('gpt-5-codex');
			});

			it('should normalize codex mini presets to codex-mini-latest', async () => {
				expect(normalizeModel('gpt-5-codex-mini')).toBe('codex-mini-latest');
				expect(normalizeModel('gpt-5-codex-mini-medium')).toBe('codex-mini-latest');
				expect(normalizeModel('gpt-5-codex-mini-high')).toBe('codex-mini-latest');
				expect(normalizeModel('openai/gpt-5-codex-mini-high')).toBe('codex-mini-latest');
				expect(normalizeModel('codex-mini-latest')).toBe('codex-mini-latest');
				expect(normalizeModel('openai/codex-mini-latest')).toBe('codex-mini-latest');
			});

			it('should normalize gpt-5.1 codex max presets', async () => {
				expect(normalizeModel('gpt-5.1-codex-max')).toBe('gpt-5.1-codex-max');
				expect(normalizeModel('gpt-5.1-codex-max-high')).toBe('gpt-5.1-codex-max');
				expect(normalizeModel('gpt-5.1-codex-max-xhigh')).toBe('gpt-5.1-codex-max');
				expect(normalizeModel('openai/gpt-5.1-codex-max-medium')).toBe('gpt-5.1-codex-max');
			});

			it('should normalize gpt-5.1 codex and mini slugs', async () => {
				expect(normalizeModel('gpt-5.1-codex')).toBe('gpt-5.1-codex');
				expect(normalizeModel('openai/gpt-5.1-codex')).toBe('gpt-5.1-codex');
				expect(normalizeModel('gpt-5.1-codex-mini')).toBe('gpt-5.1-codex-mini');
				expect(normalizeModel('gpt-5.1-codex-mini-high')).toBe('gpt-5.1-codex-mini');
				expect(normalizeModel('openai/gpt-5.1-codex-mini-medium')).toBe('gpt-5.1-codex-mini');
			});

			it('should normalize gpt-5.1 general-purpose slugs', async () => {
				expect(normalizeModel('gpt-5.1')).toBe('gpt-5.1');
				expect(normalizeModel('openai/gpt-5.1')).toBe('gpt-5.1');
				expect(normalizeModel('GPT 5.1 High')).toBe('gpt-5.1');
			});
		});

		// NEW: Edge case tests
		describe('Edge cases', () => {
			it('should handle uppercase model names', async () => {
				expect(normalizeModel('GPT-5-CODEX')).toBe('gpt-5-codex');
				expect(normalizeModel('GPT-5-HIGH')).toBe('gpt-5');
				expect(normalizeModel('CODEx-MINI-LATEST')).toBe('codex-mini-latest');
			});

			it('should handle mixed case', async () => {
				expect(normalizeModel('Gpt-5-Codex-Low')).toBe('gpt-5-codex');
				expect(normalizeModel('GpT-5-MeDiUm')).toBe('gpt-5');
			});

			it('should handle special characters', async () => {
				expect(normalizeModel('my_gpt-5_codex')).toBe('gpt-5-codex');
				expect(normalizeModel('gpt.5.high')).toBe('gpt-5');
			});

			it('should handle old verbose names', async () => {
				expect(normalizeModel('GPT 5 Codex Low (ChatGPT Subscription)')).toBe('gpt-5-codex');
				expect(normalizeModel('GPT 5 High (ChatGPT Subscription)')).toBe('gpt-5');
			});

			it('should handle empty string', async () => {
				expect(normalizeModel('')).toBe('gpt-5');
			});
		});
	});

	describe('getModelConfig', () => {
		describe('Per-model options (Bug Fix Verification)', () => {
			it('should find per-model options using config key', async () => {
				const userConfig: UserConfig = {
					global: { reasoningEffort: 'medium' },
					models: {
						'gpt-5-codex-low': {
							options: { reasoningEffort: 'low', textVerbosity: 'low' }
						}
					}
				};

				const result = getModelConfig('gpt-5-codex-low', userConfig);
				expect(result.reasoningEffort).toBe('low');
				expect(result.textVerbosity).toBe('low');
			});

			it('should merge global and per-model options (per-model wins)', async () => {
				const userConfig: UserConfig = {
					global: {
						reasoningEffort: 'medium',
						textVerbosity: 'medium',
						include: ['reasoning.encrypted_content']
					},
					models: {
						'gpt-5-codex-high': {
							options: { reasoningEffort: 'high' }  // Override only effort
						}
					}
				};

				const result = getModelConfig('gpt-5-codex-high', userConfig);
				expect(result.reasoningEffort).toBe('high');  // From per-model
				expect(result.textVerbosity).toBe('medium');  // From global
				expect(result.include).toEqual(['reasoning.encrypted_content']);  // From global
			});

			it('should return global options when model not in config', async () => {
				const userConfig: UserConfig = {
					global: { reasoningEffort: 'medium' },
					models: {
						'gpt-5-codex-low': { options: { reasoningEffort: 'low' } }
					}
				};

				// Looking up different model
				const result = getModelConfig('gpt-5-codex', userConfig);
				expect(result.reasoningEffort).toBe('medium');  // Global only
			});

			it('should handle empty config', async () => {
				const result = getModelConfig('gpt-5-codex', { global: {}, models: {} });
				expect(result).toEqual({});
			});

			it('should handle missing models object', async () => {
				const userConfig: UserConfig = {
					global: { reasoningEffort: 'low' },
					models: undefined as any
				};
				const result = getModelConfig('gpt-5', userConfig);
				expect(result.reasoningEffort).toBe('low');
			});
		});

		describe('Backwards compatibility', () => {
			it('should work with old verbose config keys', async () => {
				const userConfig: UserConfig = {
					global: {},
					models: {
						'GPT 5 Codex Low (ChatGPT Subscription)': {
							options: { reasoningEffort: 'low' }
						}
					}
				};

				const result = getModelConfig('GPT 5 Codex Low (ChatGPT Subscription)', userConfig);
				expect(result.reasoningEffort).toBe('low');
			});

			it('should work with old configs that have id field', async () => {
				const userConfig: UserConfig = {
					global: {},
					models: {
						'gpt-5-codex-low': {
							id: 'gpt-5-codex',  // id field present but should be ignored
							options: { reasoningEffort: 'low' }
						}
					}
				};

				const result = getModelConfig('gpt-5-codex-low', userConfig);
				expect(result.reasoningEffort).toBe('low');
			});
		});

		describe('Default models (no custom config)', () => {
			it('should return global options for default gpt-5-codex', async () => {
				const userConfig: UserConfig = {
					global: { reasoningEffort: 'high' },
					models: {}
				};

				const result = getModelConfig('gpt-5-codex', userConfig);
				expect(result.reasoningEffort).toBe('high');
			});

			it('should return empty when no config at all', async () => {
				const result = getModelConfig('gpt-5', undefined);
				expect(result).toEqual({});
			});
		});
	});

	describe('filterInput', () => {
		it('should keep items without IDs unchanged', async () => {
			const input: InputItem[] = [
				{ type: 'message', role: 'user', content: 'hello' },
			];
			const result = filterInput(input);
			expect(result).toEqual(input);
			expect(result![0]).not.toHaveProperty('id');
		});

		it('should remove ALL message IDs (rs_, msg_, etc.) for store:false compatibility', async () => {
			const input: InputItem[] = [
				{ id: 'rs_123', type: 'message', role: 'assistant', content: 'hello' },
				{ id: 'msg_456', type: 'message', role: 'user', content: 'world' },
				{ id: 'assistant_789', type: 'message', role: 'assistant', content: 'test' },
			];
			const result = filterInput(input);

			// All items should remain (no filtering), but ALL IDs removed
			expect(result).toHaveLength(3);
			expect(result![0]).not.toHaveProperty('id');
			expect(result![1]).not.toHaveProperty('id');
			expect(result![2]).not.toHaveProperty('id');
			expect(result![0].content).toBe('hello');
			expect(result![1].content).toBe('world');
			expect(result![2].content).toBe('test');
		});

		it('should strip ID field but preserve all other properties', async () => {
			const input: InputItem[] = [
				{
					id: 'msg_123',
					type: 'message',
					role: 'user',
					content: 'test',
					metadata: { some: 'data' }
				},
			];
			const result = filterInput(input);

			expect(result).toHaveLength(1);
			expect(result![0]).not.toHaveProperty('id');
			expect(result![0].type).toBe('message');
			expect(result![0].role).toBe('user');
			expect(result![0].content).toBe('test');
			expect(result![0]).toHaveProperty('metadata');
		});

		it('should handle mixed items with and without IDs', async () => {
			const input: InputItem[] = [
				{ type: 'message', role: 'user', content: '1' },
				{ id: 'rs_stored', type: 'message', role: 'assistant', content: '2' },
				{ id: 'msg_123', type: 'message', role: 'user', content: '3' },
			];
			const result = filterInput(input);

			// All items kept, IDs removed from items that had them
			expect(result).toHaveLength(3);
			expect(result![0]).not.toHaveProperty('id');
			expect(result![1]).not.toHaveProperty('id');
			expect(result![2]).not.toHaveProperty('id');
			expect(result![0].content).toBe('1');
			expect(result![1].content).toBe('2');
			expect(result![2].content).toBe('3');
		});

		it('should handle custom ID formats (future-proof)', async () => {
			const input: InputItem[] = [
				{ id: 'custom_id_format', type: 'message', role: 'user', content: 'test' },
				{ id: 'another-format-123', type: 'message', role: 'user', content: 'test2' },
			];
			const result = filterInput(input);

			expect(result).toHaveLength(2);
			expect(result![0]).not.toHaveProperty('id');
			expect(result![1]).not.toHaveProperty('id');
		});

		it('should return undefined for undefined input', async () => {
			expect(filterInput(undefined)).toBeUndefined();
		});

		it('should return non-array input as-is', async () => {
			const notArray = { notAnArray: true };
			expect(filterInput(notArray as any)).toBe(notArray);
		});

		it('should handle empty array', async () => {
			const input: InputItem[] = [];
			const result = filterInput(input);
			expect(result).toEqual([]);
		});
	});

	describe('addToolRemapMessage', () => {
		it('should prepend tool remap message when tools present', async () => {
			const input: InputItem[] = [
				{ type: 'message', role: 'user', content: 'hello' },
			];
			const result = addToolRemapMessage(input, true);

			expect(result).toHaveLength(2);
			expect(result![0].role).toBe('developer');
			expect(result![0].type).toBe('message');
			expect((result![0].content as any)[0].text).toContain('apply_patch');
		});

		it('should not modify input when tools not present', async () => {
			const input: InputItem[] = [
				{ type: 'message', role: 'user', content: 'hello' },
			];
			const result = addToolRemapMessage(input, false);
			expect(result).toEqual(input);
		});

		it('should return undefined for undefined input', async () => {
			expect(addToolRemapMessage(undefined, true)).toBeUndefined();
		});

		it('should handle non-array input', async () => {
			const notArray = { notAnArray: true };
			expect(addToolRemapMessage(notArray as any, true)).toBe(notArray);
		});
	});

	describe('isOpenCodeSystemPrompt', () => {
		it('should detect OpenCode system prompt with string content', async () => {
			const item: InputItem = {
				type: 'message',
				role: 'developer',
				content: 'You are a coding agent running in OpenCode',
			};
			expect(isOpenCodeSystemPrompt(item, null)).toBe(true);
		});

		it('should detect OpenCode system prompt with array content', async () => {
			const item: InputItem = {
				type: 'message',
				role: 'developer',
				content: [
					{
						type: 'input_text',
						text: 'You are a coding agent running in OpenCode',
					},
				],
			};
			expect(isOpenCodeSystemPrompt(item, null)).toBe(true);
		});

		it('should detect with system role', async () => {
			const item: InputItem = {
				type: 'message',
				role: 'system',
				content: 'You are a coding agent running in OpenCode',
			};
			expect(isOpenCodeSystemPrompt(item, null)).toBe(true);
		});

		it('should not detect non-system roles', async () => {
			const item: InputItem = {
				type: 'message',
				role: 'user',
				content: 'You are a coding agent running in OpenCode',
			};
			expect(isOpenCodeSystemPrompt(item, null)).toBe(false);
		});

		it('should not detect different content', async () => {
			const item: InputItem = {
				type: 'message',
				role: 'developer',
				content: 'Different message',
			};
			expect(isOpenCodeSystemPrompt(item, null)).toBe(false);
		});

		it('should NOT detect AGENTS.md content', async () => {
			const item: InputItem = {
				type: 'message',
				role: 'developer',
				content: '# Project Guidelines\n\nThis is custom AGENTS.md content for the project.',
			};
			expect(isOpenCodeSystemPrompt(item, null)).toBe(false);
		});

		it('should NOT detect environment info concatenated with AGENTS.md', async () => {
			const item: InputItem = {
				type: 'message',
				role: 'developer',
				content: 'Environment: /path/to/project\nDate: 2025-01-01\n\n# AGENTS.md\n\nCustom instructions here.',
			};
			expect(isOpenCodeSystemPrompt(item, null)).toBe(false);
		});

		it('should NOT detect content with codex signature in the middle', async () => {
			const cachedPrompt = 'You are a coding agent running in OpenCode.';
			const item: InputItem = {
				type: 'message',
				role: 'developer',
				// Has codex.txt content but with environment prepended (like OpenCode does)
				content: 'Environment info here\n\nYou are a coding agent running in OpenCode.',
			};
			// First 200 chars won't match because of prepended content
			expect(isOpenCodeSystemPrompt(item, cachedPrompt)).toBe(false);
		});

		it('should detect with cached prompt exact match', async () => {
			const cachedPrompt = 'You are a coding agent running in OpenCode';
			const item: InputItem = {
				type: 'message',
				role: 'developer',
				content: 'You are a coding agent running in OpenCode',
			};
			expect(isOpenCodeSystemPrompt(item, cachedPrompt)).toBe(true);
		});
	});

	describe('filterOpenCodeSystemPrompts', () => {
		it('should filter out OpenCode system prompts', async () => {
			const input: InputItem[] = [
				{
					type: 'message',
					role: 'developer',
					content: 'You are a coding agent running in OpenCode',
				},
				{ type: 'message', role: 'user', content: 'hello' },
			];
			const result = await filterOpenCodeSystemPrompts(input);
			expect(result).toHaveLength(1);
			expect(result![0].role).toBe('user');
		});

		it('should keep user messages', async () => {
			const input: InputItem[] = [
				{ type: 'message', role: 'user', content: 'message 1' },
				{ type: 'message', role: 'user', content: 'message 2' },
			];
			const result = await filterOpenCodeSystemPrompts(input);
			expect(result).toHaveLength(2);
		});

		it('should keep non-OpenCode developer messages', async () => {
			const input: InputItem[] = [
				{ type: 'message', role: 'developer', content: 'Custom instruction' },
				{ type: 'message', role: 'user', content: 'hello' },
			];
			const result = await filterOpenCodeSystemPrompts(input);
			expect(result).toHaveLength(2);
		});

		it('should keep AGENTS.md content (not filter it)', async () => {
			const input: InputItem[] = [
				{
					type: 'message',
					role: 'developer',
					content: 'You are a coding agent running in OpenCode', // This is codex.txt
				},
				{
					type: 'message',
					role: 'developer',
					content: '# Project Guidelines\n\nThis is AGENTS.md content.', // This is AGENTS.md
				},
				{ type: 'message', role: 'user', content: 'hello' },
			];
			const result = await filterOpenCodeSystemPrompts(input);
			// Should filter codex.txt but keep AGENTS.md
			expect(result).toHaveLength(2);
			expect(result![0].content).toContain('AGENTS.md');
			expect(result![1].role).toBe('user');
		});

		it('should keep environment+AGENTS.md concatenated message', async () => {
			const input: InputItem[] = [
				{
					type: 'message',
					role: 'developer',
					content: 'You are a coding agent running in OpenCode', // codex.txt alone
				},
				{
					type: 'message',
					role: 'developer',
					// environment + AGENTS.md joined (like OpenCode does)
					content: 'Working directory: /path/to/project\nDate: 2025-01-01\n\n# AGENTS.md\n\nCustom instructions.',
				},
				{ type: 'message', role: 'user', content: 'hello' },
			];
			const result = await filterOpenCodeSystemPrompts(input);
			// Should filter first message (codex.txt) but keep second (env+AGENTS.md)
			expect(result).toHaveLength(2);
			expect(result![0].content).toContain('AGENTS.md');
			expect(result![1].role).toBe('user');
		});

		it('should return undefined for undefined input', async () => {
			expect(await filterOpenCodeSystemPrompts(undefined)).toBeUndefined();
		});
	});

	describe('addCodexBridgeMessage', () => {
		it('should prepend bridge message when tools present', async () => {
			const input: InputItem[] = [
				{ type: 'message', role: 'user', content: 'hello' },
			];
			const result = addCodexBridgeMessage(input, true);

			expect(result).toHaveLength(2);
			expect(result![0].role).toBe('developer');
			expect(result![0].type).toBe('message');
			expect((result![0].content as any)[0].text).toContain('Codex Running in OpenCode');
		});

		it('should not modify input when tools not present', async () => {
			const input: InputItem[] = [
				{ type: 'message', role: 'user', content: 'hello' },
			];
			const result = addCodexBridgeMessage(input, false);
			expect(result).toEqual(input);
		});

		it('should return undefined for undefined input', async () => {
			expect(addCodexBridgeMessage(undefined, true)).toBeUndefined();
		});
	});

		describe('transformRequestBody', () => {
			const codexInstructions = 'Test Codex Instructions';

			it('preserves existing prompt_cache_key passed by host (OpenCode)', async () => {
				const body: RequestBody = {
					model: 'gpt-5-codex',
					input: [],
					// Host-provided key (OpenCode session id)
					// @ts-expect-error extra field allowed
					prompt_cache_key: 'ses_host_key_123',
				};
				const result: any = await transformRequestBody(body, codexInstructions);
				expect(result.prompt_cache_key).toBe('ses_host_key_123');
			});

			it('leaves prompt_cache_key unset when host does not supply one', async () => {
				const body: RequestBody = {
					model: 'gpt-5',
					input: [],
				};
				const result: any = await transformRequestBody(body, codexInstructions);
				expect(result.prompt_cache_key).toBeUndefined();
			});

		it('should set required Codex fields', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
			};
			const result = await transformRequestBody(body, codexInstructions);

			expect(result.store).toBe(false);
			expect(result.stream).toBe(true);
			expect(result.instructions).toBe(codexInstructions);
		});

		it('should normalize model name', async () => {
			const body: RequestBody = {
				model: 'gpt-5-mini',
				input: [],
			};
			const result = await transformRequestBody(body, codexInstructions);
			expect(result.model).toBe('gpt-5');
		});

		it('should apply default reasoning config', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
			};
			const result = await transformRequestBody(body, codexInstructions);

			expect(result.reasoning?.effort).toBe('medium');
			expect(result.reasoning?.summary).toBe('auto');
		});

		it('should apply user reasoning config', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
			};
			const userConfig: UserConfig = {
				global: {
					reasoningEffort: 'high',
					reasoningSummary: 'detailed',
				},
				models: {},
			};
			const result = await transformRequestBody(body, codexInstructions, userConfig);

			expect(result.reasoning?.effort).toBe('high');
			expect(result.reasoning?.summary).toBe('detailed');
		});

		it('should apply default text verbosity', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
			};
			const result = await transformRequestBody(body, codexInstructions);
			expect(result.text?.verbosity).toBe('medium');
		});

		it('should apply user text verbosity', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
			};
			const userConfig: UserConfig = {
				global: { textVerbosity: 'low' },
				models: {},
			};
			const result = await transformRequestBody(body, codexInstructions, userConfig);
			expect(result.text?.verbosity).toBe('low');
		});

		it('should set default include for encrypted reasoning', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
			};
			const result = await transformRequestBody(body, codexInstructions);
			expect(result.include).toEqual(['reasoning.encrypted_content']);
		});

		it('should use user-configured include', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
			};
			const userConfig: UserConfig = {
				global: { include: ['custom_field', 'reasoning.encrypted_content'] },
				models: {},
			};
			const result = await transformRequestBody(body, codexInstructions, userConfig);
			expect(result.include).toEqual(['custom_field', 'reasoning.encrypted_content']);
		});

		it('should remove IDs from input array (keep all items, strip IDs)', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [
					{ id: 'rs_123', type: 'message', role: 'assistant', content: 'old' },
					{ type: 'message', role: 'user', content: 'new' },
				],
			};
			const result = await transformRequestBody(body, codexInstructions);

			// All items kept, IDs removed
			expect(result.input).toHaveLength(2);
			expect(result.input![0]).not.toHaveProperty('id');
			expect(result.input![1]).not.toHaveProperty('id');
			expect(result.input![0].content).toBe('old');
			expect(result.input![1].content).toBe('new');
		});

		it('should add tool remap message when tools present', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [{ type: 'message', role: 'user', content: 'hello' }],
				tools: [{ name: 'test_tool' }],
			};
			const result = await transformRequestBody(body, codexInstructions);
			expect(result.input![0].role).toBe('developer');
		});

		it('should not add tool remap message when tools absent', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [{ type: 'message', role: 'user', content: 'hello' }],
			};
			const result = await transformRequestBody(body, codexInstructions);
			expect(result.input![0].role).toBe('user');
		});

		it('should remove unsupported parameters', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
				max_output_tokens: 1000,
				max_completion_tokens: 2000,
			};
			const result = await transformRequestBody(body, codexInstructions);
			expect(result.max_output_tokens).toBeUndefined();
			expect(result.max_completion_tokens).toBeUndefined();
		});

		it('should normalize minimal to low for gpt-5-codex', async () => {
			const body: RequestBody = {
				model: 'gpt-5-codex',
				input: [],
			};
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'minimal' },
				models: {},
			};
			const result = await transformRequestBody(body, codexInstructions, userConfig);
			expect(result.reasoning?.effort).toBe('low');
		});

		it('should clamp xhigh to high for codex-mini', async () => {
			const body: RequestBody = {
				model: 'gpt-5.1-codex-mini-high',
				input: [],
			};
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'xhigh' },
				models: {},
			};
			const result = await transformRequestBody(body, codexInstructions, userConfig);
			expect(result.reasoning?.effort).toBe('high');
		});

		it('should clamp none to medium for codex-mini', async () => {
			const body: RequestBody = {
				model: 'gpt-5.1-codex-mini-medium',
				input: [],
			};
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'none' },
				models: {},
			};
			const result = await transformRequestBody(body, codexInstructions, userConfig);
			expect(result.reasoning?.effort).toBe('medium');
		});

		it('should default codex-max to high effort', async () => {
			const body: RequestBody = {
				model: 'gpt-5.1-codex-max',
				input: [],
			};
			const result = await transformRequestBody(body, codexInstructions);
			expect(result.reasoning?.effort).toBe('high');
		});

		it('should preserve xhigh for codex-max when requested', async () => {
			const body: RequestBody = {
				model: 'gpt-5.1-codex-max-xhigh',
				input: [],
			};
			const userConfig: UserConfig = {
				global: { reasoningSummary: 'auto' },
				models: {
					'gpt-5.1-codex-max-xhigh': {
						options: { reasoningEffort: 'xhigh', reasoningSummary: 'detailed' },
					},
				},
			};
			const result = await transformRequestBody(body, codexInstructions, userConfig);
			expect(result.model).toBe('gpt-5.1-codex-max');
			expect(result.reasoning?.effort).toBe('xhigh');
			expect(result.reasoning?.summary).toBe('detailed');
		});

		it('should downgrade xhigh to high for non-max codex', async () => {
			const body: RequestBody = {
				model: 'gpt-5.1-codex-high',
				input: [],
			};
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'xhigh' },
				models: {},
			};
			const result = await transformRequestBody(body, codexInstructions, userConfig);
			expect(result.model).toBe('gpt-5.1-codex');
			expect(result.reasoning?.effort).toBe('high');
		});

		it('should downgrade xhigh to high for non-max general models', async () => {
			const body: RequestBody = {
				model: 'gpt-5.1-high',
				input: [],
			};
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'xhigh' },
				models: {},
			};
			const result = await transformRequestBody(body, codexInstructions, userConfig);
			expect(result.model).toBe('gpt-5.1');
			expect(result.reasoning?.effort).toBe('high');
		});

		it('should preserve minimal for non-codex models', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
			};
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'minimal' },
				models: {},
			};
			const result = await transformRequestBody(body, codexInstructions, userConfig);
			expect(result.reasoning?.effort).toBe('minimal');
		});

		it('should use minimal effort for lightweight models', async () => {
			const body: RequestBody = {
				model: 'gpt-5-nano',
				input: [],
			};
			const result = await transformRequestBody(body, codexInstructions);
			expect(result.reasoning?.effort).toBe('medium');
		});

		describe('CODEX_MODE parameter', () => {
			it('should use bridge message when codexMode=true and tools present (default)', async () => {
				const body: RequestBody = {
					model: 'gpt-5',
					input: [{ type: 'message', role: 'user', content: 'hello' }],
					tools: [{ name: 'test_tool' }],
				};
				const result = await transformRequestBody(body, codexInstructions, undefined, true);

				expect(result.input).toHaveLength(2);
				expect(result.input![0].role).toBe('developer');
				expect((result.input![0].content as any)[0].text).toContain('Codex Running in OpenCode');
			});

			it('should filter OpenCode prompts when codexMode=true', async () => {
				const body: RequestBody = {
					model: 'gpt-5',
					input: [
						{
							type: 'message',
							role: 'developer',
							content: 'You are a coding agent running in OpenCode',
						},
						{ type: 'message', role: 'user', content: 'hello' },
					],
					tools: [{ name: 'test_tool' }],
				};
				const result = await transformRequestBody(body, codexInstructions, undefined, true);

				// Should have bridge message + user message (OpenCode prompt filtered out)
				expect(result.input).toHaveLength(2);
				expect(result.input![0].role).toBe('developer');
				expect((result.input![0].content as any)[0].text).toContain('Codex Running in OpenCode');
				expect(result.input![1].role).toBe('user');
			});

			it('should not add bridge message when codexMode=true but no tools', async () => {
				const body: RequestBody = {
					model: 'gpt-5',
					input: [{ type: 'message', role: 'user', content: 'hello' }],
				};
				const result = await transformRequestBody(body, codexInstructions, undefined, true);

				expect(result.input).toHaveLength(1);
				expect(result.input![0].role).toBe('user');
			});

			it('should use tool remap message when codexMode=false', async () => {
				const body: RequestBody = {
					model: 'gpt-5',
					input: [{ type: 'message', role: 'user', content: 'hello' }],
					tools: [{ name: 'test_tool' }],
				};
				const result = await transformRequestBody(body, codexInstructions, undefined, false);

				expect(result.input).toHaveLength(2);
				expect(result.input![0].role).toBe('developer');
				expect((result.input![0].content as any)[0].text).toContain('apply_patch');
			});

			it('should not filter OpenCode prompts when codexMode=false', async () => {
				const body: RequestBody = {
					model: 'gpt-5',
					input: [
						{
							type: 'message',
							role: 'developer',
							content: 'You are a coding agent running in OpenCode',
						},
						{ type: 'message', role: 'user', content: 'hello' },
					],
					tools: [{ name: 'test_tool' }],
				};
				const result = await transformRequestBody(body, codexInstructions, undefined, false);

				// Should have tool remap + opencode prompt + user message
				expect(result.input).toHaveLength(3);
				expect(result.input![0].role).toBe('developer');
				expect((result.input![0].content as any)[0].text).toContain('apply_patch');
				expect(result.input![1].role).toBe('developer');
				expect(result.input![2].role).toBe('user');
			});

			it('should default to codexMode=true when parameter not provided', async () => {
				const body: RequestBody = {
					model: 'gpt-5',
					input: [{ type: 'message', role: 'user', content: 'hello' }],
					tools: [{ name: 'test_tool' }],
				};
				// Not passing codexMode parameter - should default to true
				const result = await transformRequestBody(body, codexInstructions);

				// Should use bridge message (codexMode=true by default)
				expect(result.input![0].role).toBe('developer');
				expect((result.input![0].content as any)[0].text).toContain('Codex Running in OpenCode');
			});
		});

		// NEW: Integration tests for all config scenarios
		describe('Integration: Complete Config Scenarios', () => {
			describe('Scenario 1: Default models (no custom config)', () => {
				it('should handle gpt-5-codex with global options only', async () => {
					const body: RequestBody = {
						model: 'gpt-5-codex',
						input: []
					};
					const userConfig: UserConfig = {
						global: { reasoningEffort: 'high' },
						models: {}
					};

					const result = await transformRequestBody(body, codexInstructions, userConfig);

					expect(result.model).toBe('gpt-5-codex');  // Not changed
					expect(result.reasoning?.effort).toBe('high');  // From global
					expect(result.store).toBe(false);
				});

				it('should handle gpt-5-mini normalizing to gpt-5', async () => {
					const body: RequestBody = {
						model: 'gpt-5-mini',
						input: []
					};

					const result = await transformRequestBody(body, codexInstructions);

					expect(result.model).toBe('gpt-5');  // Normalized
					expect(result.reasoning?.effort).toBe('medium');  // Default for normalized gpt-5
				});
			});

			describe('Scenario 2: Custom preset names (new style)', () => {
				const userConfig: UserConfig = {
					global: { reasoningEffort: 'medium', include: ['reasoning.encrypted_content'] },
					models: {
						'gpt-5-codex-low': {
							options: { reasoningEffort: 'low' }
						},
						'gpt-5-codex-high': {
							options: { reasoningEffort: 'high', reasoningSummary: 'detailed' }
						}
					}
				};

				it('should apply per-model options for gpt-5-codex-low', async () => {
					const body: RequestBody = {
						model: 'gpt-5-codex-low',
						input: []
					};

					const result = await transformRequestBody(body, codexInstructions, userConfig);

					expect(result.model).toBe('gpt-5-codex');  // Normalized
					expect(result.reasoning?.effort).toBe('low');  // From per-model
					expect(result.include).toEqual(['reasoning.encrypted_content']);  // From global
				});

				it('should apply per-model options for gpt-5-codex-high', async () => {
					const body: RequestBody = {
						model: 'gpt-5-codex-high',
						input: []
					};

					const result = await transformRequestBody(body, codexInstructions, userConfig);

					expect(result.model).toBe('gpt-5-codex');  // Normalized
					expect(result.reasoning?.effort).toBe('high');  // From per-model
					expect(result.reasoning?.summary).toBe('detailed');  // From per-model
				});

				it('should use global options for default gpt-5-codex', async () => {
					const body: RequestBody = {
						model: 'gpt-5-codex',
						input: []
					};

					const result = await transformRequestBody(body, codexInstructions, userConfig);

					expect(result.model).toBe('gpt-5-codex');  // Not changed
					expect(result.reasoning?.effort).toBe('medium');  // From global (no per-model)
				});
			});

			describe('Scenario 3: Backwards compatibility (old verbose names)', () => {
				const userConfig: UserConfig = {
					global: {},
					models: {
						'GPT 5 Codex Low (ChatGPT Subscription)': {
							options: { reasoningEffort: 'low', textVerbosity: 'low' }
						}
					}
				};

				it('should find and apply old config format', async () => {
					const body: RequestBody = {
						model: 'GPT 5 Codex Low (ChatGPT Subscription)',
						input: []
					};

					const result = await transformRequestBody(body, codexInstructions, userConfig);

					expect(result.model).toBe('gpt-5-codex');  // Normalized
					expect(result.reasoning?.effort).toBe('low');  // From per-model (old format)
					expect(result.text?.verbosity).toBe('low');
				});
			});

			describe('Scenario 4: Mixed default + custom models', () => {
				const userConfig: UserConfig = {
					global: { reasoningEffort: 'medium' },
					models: {
						'gpt-5-codex-low': {
							options: { reasoningEffort: 'low' }
						}
					}
				};

				it('should use per-model for custom variant', async () => {
					const body: RequestBody = {
						model: 'gpt-5-codex-low',
						input: []
					};

					const result = await transformRequestBody(body, codexInstructions, userConfig);

					expect(result.reasoning?.effort).toBe('low');  // Per-model
				});

				it('should use global for default model', async () => {
					const body: RequestBody = {
						model: 'gpt-5',
						input: []
					};

					const result = await transformRequestBody(body, codexInstructions, userConfig);

					expect(result.reasoning?.effort).toBe('medium');  // Global
				});
			});

			describe('Scenario 5: Message ID filtering with multi-turn', () => {
				it('should remove ALL IDs in multi-turn conversation', async () => {
					const body: RequestBody = {
						model: 'gpt-5-codex',
						input: [
							{ id: 'msg_turn1', type: 'message', role: 'user', content: 'first' },
							{ id: 'rs_response1', type: 'message', role: 'assistant', content: 'response' },
							{ id: 'msg_turn2', type: 'message', role: 'user', content: 'second' },
							{ id: 'assistant_123', type: 'message', role: 'assistant', content: 'reply' },
						]
					};

					const result = await transformRequestBody(body, codexInstructions);

					// All items kept, ALL IDs removed
					expect(result.input).toHaveLength(4);
					expect(result.input!.every(item => !item.id)).toBe(true);
					expect(result.store).toBe(false);  // Stateless mode
					expect(result.include).toEqual(['reasoning.encrypted_content']);
				});
			});

			describe('Scenario 6: Complete end-to-end transformation', () => {
				it('should handle full transformation: custom model + IDs + tools', async () => {
					const userConfig: UserConfig = {
						global: { include: ['reasoning.encrypted_content'] },
						models: {
							'gpt-5-codex-low': {
								options: {
									reasoningEffort: 'low',
									textVerbosity: 'low',
									reasoningSummary: 'auto'
								}
							}
						}
					};

					const body: RequestBody = {
						model: 'gpt-5-codex-low',
						input: [
							{ id: 'msg_1', type: 'message', role: 'user', content: 'test' },
							{ id: 'rs_2', type: 'message', role: 'assistant', content: 'reply' }
						],
						tools: [{ name: 'edit' }]
					};

					const result = await transformRequestBody(body, codexInstructions, userConfig);

					// Model normalized
					expect(result.model).toBe('gpt-5-codex');

					// IDs removed
					expect(result.input!.every(item => !item.id)).toBe(true);

					// Per-model options applied
					expect(result.reasoning?.effort).toBe('low');
					expect(result.reasoning?.summary).toBe('auto');
					expect(result.text?.verbosity).toBe('low');

					// Codex fields set
					expect(result.store).toBe(false);
					expect(result.stream).toBe(true);
					expect(result.instructions).toBe(codexInstructions);
					expect(result.include).toEqual(['reasoning.encrypted_content']);
				});
			});
		});
	});
});
