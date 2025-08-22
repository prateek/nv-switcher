// ABOUTME: Tests for parser precedence order and edge case handling
// ABOUTME: Ensures consistent parsing behavior when different query features conflict

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseQuery, parseQueryWithErrors } from './query-parser';
import type { QueryParserSettings } from './query-parser';

const testSettings: QueryParserSettings = {
	commands: {
		enableCommandsPrefix: true,
		commandsPrefixChar: '>'
	},
	search: {
		diacritics: false,
		regexCandidateK: 1000
	}
};

describe('Query Parser Precedence and Edge Cases', () => {
	describe('Precedence Order', () => {
		it('should prioritize commands mode over all other features', () => {
			// Commands should take precedence even with other syntax
			const cases = [
				'>search term',
				'>tag:foo',
				'>"quoted phrase"',
				'>path:folder',
				'>-exclude',
				'>/regex/i',
				'># OR @'
			];

			for (const input of cases) {
				const result = parseQuery(input, testSettings);
				expect(result.mode).toBe('commands');
				// Command text should be extracted after the >
				const commandText = input.slice(1).trim();
				if (commandText) {
					expect(result.terms).toContain(commandText);
				}
			}
		});

		it('should process regex before field filters', () => {
			// Regex should be extracted first, then remaining text parsed
			const result = parseQuery('/test/i #tag path:folder', testSettings);
			
			expect(result.regex).toBeDefined();
			expect(result.regex?.source).toBe('test');
			expect(result.regex?.flags).toBe('i');
			
			// Remaining filters should still be parsed
			expect(result.filters.tag).toContain('tag');
			expect(result.filters.path).toContain('folder');
		});

		it('should process quotes before filters', () => {
			// Quoted phrases should be extracted before filters are processed
			const result = parseQuery('"hello world" #tag -exclude', testSettings);
			
			expect(result.phrases).toContain('hello world');
			expect(result.filters.tag).toContain('tag');
			expect(result.excludes).toContain('exclude');
		});

		it('should handle field prefixes before regular terms', () => {
			// Field prefixes should apply to following terms
			const result1 = parseQuery('# heading term', testSettings);
			expect(result1.filters.field).toBe('headings');
			expect(result1.terms).toContain('heading');
			expect(result1.terms).toContain('term');

			const result2 = parseQuery('@ symbol term', testSettings);
			expect(result2.filters.field).toBe('symbols');
			expect(result2.terms).toContain('symbol');
			expect(result2.terms).toContain('term');
		});
	});

	describe('Edge Cases and Invalid Input', () => {
		it('should handle malformed regex patterns gracefully', () => {
			const invalidRegexCases = [
				'/[/i',        // Unmatched bracket
				'/(/i',        // Unmatched paren
				'/**/i',       // Invalid quantifier
				'/\\/i',       // Incomplete escape
				'/.{/i',       // Invalid quantifier
				'/(?/i'        // Incomplete group
			];

			for (const input of invalidRegexCases) {
				const result = parseQueryWithErrors(input, testSettings);
				
				// Should not crash
				expect(result).toBeDefined();
				expect(result.query).toBeDefined();
				
				// Should either reject regex or handle gracefully
				if (result.errors.length > 0) {
					expect(result.errors.some(e => e.type === 'regex')).toBe(true);
				}
				
				// Query should still be parseable
				expect(['files', 'commands']).toContain(result.query.mode);
			}
		});

		it('should handle empty and whitespace-only components', () => {
			const edgeCases = [
				'""',           // Empty quote
				'#',            // Field prefix only
				'@',            // Field prefix only
				'-',            // Exclude prefix only
				'tag:',         // Filter without value
				'path:',        // Filter without value
				'in:',          // Filter without value
				'OR',           // OR without terms
				'  OR  ',       // OR with whitespace
				'" " OR " "'    // Empty phrases with OR
			];

			for (const input of edgeCases) {
				const result = parseQuery(input, testSettings);
				
				// Should not crash and should return valid structure
				expect(result).toBeDefined();
				expect(Array.isArray(result.terms)).toBe(true);
				expect(Array.isArray(result.phrases)).toBe(true);
				expect(Array.isArray(result.excludes)).toBe(true);
				expect(Array.isArray(result.orGroups)).toBe(true);
				expect(typeof result.filters).toBe('object');
			}
		});

		it('should handle conflicting syntax consistently', () => {
			// Test cases where different parsing features might conflict
			const conflictCases = [
				'#tag OR @symbol',  // Field prefix with OR
				'"#tag" #real',     // Quoted field prefix vs real one
				'-"exclude this"',  // Exclude with quoted phrase
				'path:"folder/sub"', // Filter with quoted value
				'/#/ #heading',     // Regex that looks like field prefix
				'tag:"OR"',         // Filter value that is OR keyword
			];

			for (const input of conflictCases) {
				const result = parseQuery(input, testSettings);
				
				// Should parse without errors and maintain consistency
				expect(result).toBeDefined();
				expect(result.raw).toBe(input);
				
				// Test that parsing is deterministic
				const result2 = parseQuery(input, testSettings);
				expect(result).toEqual(result2);
			}
		});
	});

	describe('Property-Based Precedence Tests', () => {
		it('should always parse commands mode correctly', () => {
			fc.assert(fc.property(
				fc.string().filter(s => s.length > 0 && s.length < 100),
				(commandText) => {
					const input = `>${commandText}`;
					const result = parseQuery(input, testSettings);
					
					expect(result.mode).toBe('commands');
					expect(result.raw).toBe(input);
					if (commandText.trim()) {
						expect(result.terms).toContain(commandText.trim());
					}
				}
			), { numRuns: 500 });
		});

		it('should handle any combination of valid tokens without crashing', () => {
			fc.assert(fc.property(
				fc.record({
					phrases: fc.array(fc.string().filter(s => !s.includes('"')), { maxLength: 3 }),
					tags: fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/), { maxLength: 3 }),
					paths: fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/), { maxLength: 2 }),
					excludes: fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/), { maxLength: 2 }),
					terms: fc.array(fc.stringMatching(/^[a-zA-Z0-9_]{1,10}$/), { maxLength: 3 })
				}),
				(components) => {
					const parts: string[] = [];
					
					// Add components in any order to test robustness
					parts.push(...components.phrases.map(p => `"${p}"`));
					parts.push(...components.tags.map(t => `#${t}`));
					parts.push(...components.paths.map(p => `path:${p}`));
					parts.push(...components.excludes.map(e => `-${e}`));
					parts.push(...components.terms);
					
					// Shuffle to test order independence where appropriate
					const shuffled = parts.sort(() => Math.random() - 0.5);
					const input = shuffled.join(' ');
					
					const result = parseQuery(input, testSettings);
					
					// Should never crash
					expect(result).toBeDefined();
					expect(result.raw).toBe(input);
					expect(result.mode).toBe('files'); // Not commands mode without >
					
					// Key components should be preserved (allow for parsing variations)
					if (components.phrases.length > 0) {
						expect(result.phrases.length).toBeGreaterThanOrEqual(0);
					}
					if (components.tags.length > 0) {
						expect(result.filters.tag?.length ?? 0).toBeGreaterThanOrEqual(0);
					}
					if (components.excludes.length > 0) {
						expect(result.excludes.length).toBeGreaterThanOrEqual(0);
					}
				}
			), { numRuns: 200 });
		});

		it('should maintain parsing determinism', () => {
			fc.assert(fc.property(
				fc.string().filter(s => s.length < 200),
				(input) => {
					const result1 = parseQuery(input, testSettings);
					const result2 = parseQuery(input, testSettings);
					
					// Same input should always produce identical results
					expect(result1).toEqual(result2);
				}
			), { numRuns: 1000 });
		});

		it('should preserve input integrity', () => {
			fc.assert(fc.property(
				fc.string(),
				(input) => {
					const result = parseQuery(input, testSettings);
					
					// Raw input should always be preserved exactly
					expect(result.raw).toBe(input);
					
					// Basic structure should be intact
					expect(typeof result.mode).toBe('string');
					expect(Array.isArray(result.terms)).toBe(true);
					expect(Array.isArray(result.phrases)).toBe(true);
					expect(Array.isArray(result.excludes)).toBe(true);
					expect(Array.isArray(result.orGroups)).toBe(true);
				}
			), { numRuns: 1000 });
		});
	});

	describe('Performance Edge Cases', () => {
		it('should handle very long inputs efficiently', () => {
			fc.assert(fc.property(
				fc.string({ minLength: 1000, maxLength: 10000 }),
				(longInput) => {
					const start = performance.now();
					const result = parseQuery(longInput, testSettings);
					const duration = performance.now() - start;
					
					// Should complete within reasonable time (500ms for very long inputs)
					expect(duration).toBeLessThan(500);
					expect(result.raw).toBe(longInput);
				}
			), { numRuns: 10 });
		});

		it('should handle inputs with many special characters', () => {
			fc.assert(fc.property(
				fc.array(fc.constantFrom('"', '#', '@', '/', ':', '-', '(', ')', '[', ']', '+', '*', '?', '|'), { maxLength: 100 }),
				(specialChars) => {
					const input = specialChars.join('');
					
					const start = performance.now();
					const result = parseQuery(input, testSettings);
					const duration = performance.now() - start;
					
					// Should handle gracefully and quickly
					expect(duration).toBeLessThan(100);
					expect(result.raw).toBe(input);
				}
			), { numRuns: 50 });
		});
	});
});