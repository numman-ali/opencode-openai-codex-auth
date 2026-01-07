import { describe, it, expect } from 'vitest';
import { parse, modify, applyEdits, stripComments } from 'jsonc-parser';

describe('Install Script - JSONC Support', () => {
	describe('jsonc-parser Integration', () => {
		it('should parse JSONC with single line comments', () => {
			const jsonc = `{
				// This is a comment
				"key": "value"
			}`;
			const result = parse(jsonc);
			expect(result).toEqual({ key: "value" });
		});

		it('should parse JSONC with block comments', () => {
			const jsonc = `{
				/* This is a
				   multi-line comment */
				"key": "value"
			}`;
			const result = parse(jsonc);
			expect(result).toEqual({ key: "value" });
		});

		it('should parse JSONC with trailing commas', () => {
			const jsonc = `{
				"key1": "value1",
				"key2": "value2",
			}`;
			const result = parse(jsonc);
			expect(result).toEqual({ key1: "value1", key2: "value2" });
		});

		it('should preserve comments when using modify + applyEdits', () => {
			const original = `{
				// Important note
				"existingKey": "existingValue",
				/* Another important
				   multi-line comment */
				"unchangedKey": "unchanged"
			}`;

			const edits = modify(original, ['existingKey'], 'newValue', {
				formattingOptions: { tabSize: 2, insertSpaces: true, eol: '\n' }
			});
			const result = applyEdits(original, edits);

			expect(result).toContain('// Important note');
			expect(result).toContain('/* Another important');
			expect(result).toContain('"unchangedKey"');
		});

		it('should preserve comments when modifying specific properties', () => {
			const original = `{
				// Header comment
				"$schema": "https://opencode.ai/config.json",
				
				// Provider configuration
				"provider": {
					"openai": {
						// Model settings
						"models": {}
					}
				},
				
				/* Footer comment */
				"plugin": []
			}`;

			// Modify specific nested property (not full object replacement)
			const newModels = { "new-model": true };
			const edits = modify(original, ['provider', 'openai', 'models'], newModels, {
				formattingOptions: { tabSize: 2, insertSpaces: true, eol: '\n' }
			});
			const result = applyEdits(original, edits);

			expect(result).toContain('// Header comment');
			expect(result).toContain('// Provider configuration');
			expect(result).toContain('// Model settings');
			expect(result).toContain('/* Footer comment */');
			expect(result).toContain('"new-model"');
		});
	});

	describe('Deep Merge Logic', () => {
		function deepMerge(target, source) {
			const output = { ...target };
			if (isObject(target) && isObject(source)) {
				Object.keys(source).forEach(key => {
					if (isObject(source[key])) {
						if (!(key in target)) {
							Object.assign(output, { [key]: source[key] });
						} else {
							output[key] = deepMerge(target[key], source[key]);
						}
					} else {
						Object.assign(output, { [key]: source[key] });
					}
				});
			}
			return output;
		}

		function isObject(item) {
			return item && typeof item === 'object' && !Array.isArray(item);
		}

		it('should merge simple objects', () => {
			const target = { a: 1, b: 2 };
			const source = { b: 3, c: 4 };
			const result = deepMerge(target, source);
			expect(result).toEqual({ a: 1, b: 3, c: 4 });
		});

		it('should deep merge nested objects', () => {
			const target = {
				provider: {
					openai: {
						models: {},
						options: { timeout: 30000 }
					}
				}
			};
			const source = {
				provider: {
					openai: {
						models: { "new-model": true },
						apiKey: "new-key"
					}
				}
			};
			const result = deepMerge(target, source);
			expect(result).toEqual({
				provider: {
					openai: {
						models: { "new-model": true },
						options: { timeout: 30000 },
						apiKey: "new-key"
					}
				}
			});
		});

		it('should overwrite arrays', () => {
			const target = { plugin: ["old"] };
			const source = { plugin: ["new"] };
			const result = deepMerge(target, source);
			expect(result).toEqual({ plugin: ["new"] });
		});
	});

	describe('Edge Cases', () => {
		it('should handle malformed JSONC gracefully', () => {
			const malformed = `{"incomplete`;
			expect(() => parse(malformed)).not.toThrow();
		});

		it('should handle empty JSONC file', () => {
			const empty = '';
			const result = parse(empty);
			expect(result).toBeUndefined();
		});

		it('should handle JSONC with only comments', () => {
			const onlyComments = `// Comment\n/* Block comment */`;
			const result = parse(onlyComments);
			expect(result).toBeUndefined();
		});

		it('should strip comments', () => {
			const jsonc = `// Comment\n{\n  "key": "value"\n}/* End */`;
			const cleaned = stripComments(jsonc);
			expect(cleaned).not.toContain('// Comment');
			expect(cleaned).not.toContain('/* End */');
		});
	});
});
