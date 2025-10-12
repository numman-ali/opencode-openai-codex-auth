import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	normalizeModel,
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
	});

	describe('filterInput', () => {
		it('should keep items without IDs', async () => {
			const input: InputItem[] = [
				{ type: 'message', role: 'user', content: 'hello' },
			];
			const result = filterInput(input);
			expect(result).toEqual(input);
		});

		it('should strip server-generated IDs but keep content', async () => {
			const input: InputItem[] = [
				{ id: 'rs_123', type: 'message', role: 'user', content: 'hello' },
				{ id: 'msg_456', type: 'message', role: 'user', content: 'world' },
			];
			const result = filterInput(input);
			expect(result).toHaveLength(2);
			expect((result![0]).id).toBeUndefined();
			expect((result![1]).id).toBeUndefined();
			expect(result![0].content).toBe('hello');
			expect(result![1].content).toBe('world');
		});

		it('should handle mixed items by dropping ids but preserving order/content', async () => {
			const input: InputItem[] = [
				{ type: 'message', role: 'user', content: '1' },
				{ id: 'rs_stored', type: 'message', role: 'assistant', content: '2' },
				{ id: 'msg_123', type: 'message', role: 'user', content: '3' },
			];
			const result = filterInput(input);
			expect(result).toHaveLength(3);
			expect(result![0].content).toBe('1');
			expect(result![1].content).toBe('2');
			expect(result![2].content).toBe('3');
			expect((result![1]).id).toBeUndefined();
			expect((result![2]).id).toBeUndefined();
		});

		it('should return undefined for undefined input', async () => {
			expect(filterInput(undefined)).toBeUndefined();
		});

		it('should return non-array input as-is', async () => {
			const notArray = { notAnArray: true };
			expect(filterInput(notArray as any)).toBe(notArray);
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

		it('should filter input array by removing item_references and stripping ids', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [
					{ id: 'rs_123', type: 'message', role: 'assistant', content: 'old' },
					{ type: 'message', role: 'user', content: 'new' },
				],
			};
			const result = await transformRequestBody(body, codexInstructions);
			expect(result.input).toHaveLength(2);
			expect(result.input![0].role).toBe('assistant');
			expect(result.input![0].content).toBe('old');
			expect((result.input![0]).id).toBeUndefined();
			expect(result.input![1].role).toBe('user');
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
			expect(result.reasoning?.effort).toBe('minimal');
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
	});
});
