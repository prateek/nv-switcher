// ABOUTME: Property-based tests for query parser using fast-check
// ABOUTME: Tests parser invariants with randomly generated inputs to ensure robustness

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseQuery, parseQueryWithErrors, validateParsedQuery } from './query-parser';
import type { QueryParserSettings } from './query-parser';
import type { ParsedQuery } from './types';

const defaultSettings: QueryParserSettings = {
	commands: {
		enableCommandsPrefix: true,
		commandsPrefixChar: '>'
	},
	search: {
		diacritics: false,
		regexCandidateK: 1000
	}
};

describe.skip('Query Parser Property-Based Tests', () => {
	describe('Parser Invariants', () => {
		it('should never throw on any input string', () => {
			fc.assert(fc.property(
				fc.string(),
				(input) => {
					expect(() => parseQuery(input, defaultSettings)).not.toThrow();
					expect(() => parseQueryWithErrors(input, defaultSettings)).not.toThrow();
				}
			), { numRuns: 1000 });
		});

		it('should preserve raw input in result', () => {
			fc.assert(fc.property(
				fc.string(),
				(input) => {
					const result = parseQuery(input, defaultSettings);
					expect(result.raw).toBe(input);
				}
			), { numRuns: 500 });
		});

		it('should always return valid ParsedQuery structure', () => {
			fc.assert(fc.property(
				fc.string(),
				(input) => {
					const result = parseQuery(input, defaultSettings);
					expect(() => validateParsedQuery(result)).not.toThrow();
					
					// Basic structure validation
					expect(result).toHaveProperty('raw');
					expect(result).toHaveProperty('mode');
					expect(result).toHaveProperty('terms');
					expect(result).toHaveProperty('phrases');
					expect(result).toHaveProperty('excludes');
					expect(result).toHaveProperty('orGroups');
					expect(result).toHaveProperty('filters');
					
					expect(Array.isArray(result.terms)).toBe(true);
					expect(Array.isArray(result.phrases)).toBe(true);
					expect(Array.isArray(result.excludes)).toBe(true);
					expect(Array.isArray(result.orGroups)).toBe(true);
					expect(typeof result.filters).toBe('object');
					expect(['files', 'commands']).toContain(result.mode);
				}
			), { numRuns: 500 });
		});

		it('should handle Unicode and special characters gracefully', () => {
			fc.assert(fc.property(
				fc.string({ minLength: 0, maxLength: 100 }).map(s => s + 'ñáéíóú中文🎉'), // Add some Unicode
				(input) => {
					const result = parseQuery(input, defaultSettings);
					expect(result.raw).toBe(input);
					// Should not crash and should return valid structure
					expect(() => validateParsedQuery(result)).not.toThrow();
				}
			), { numRuns: 300 });
		});
	});

	describe('Quote Parsing Invariants', () => {
		it('should extract non-empty quoted phrases', () => {
			fc.assert(fc.property(
				fc.array(fc.string().filter(s => !s.includes('"') && s.trim().length > 0), { minLength: 1, maxLength: 3 }),
				(phrases) => {
					const quotedPhrases = phrases.map(p => `"${p}"`);
					const input = quotedPhrases.join(' ');
					
					const result = parseQuery(input, defaultSettings);
					
					// Each non-empty quoted phrase should be extracted
					for (const phrase of phrases) {
						expect(result.phrases).toContain(phrase);
					}
				}
			), { numRuns: 200 });
		});

		it('should handle quote parsing without crashing', () => {
			fc.assert(fc.property(
				fc.string(),
				(input) => {
					// Parser should handle any quote-containing input gracefully
					const result = parseQuery(input, defaultSettings);
					expect(() => validateParsedQuery(result)).not.toThrow();
					expect(result.phrases).toBeDefined();
					expect(Array.isArray(result.phrases)).toBe(true);
				}
			), { numRuns: 300 });
		});

		it('should handle malformed quotes gracefully', () => {
			fc.assert(fc.property(
				fc.string().filter(s => s.includes('"')),
				(input) => {
					const result = parseQuery(input, defaultSettings);
					// Should not crash even with malformed quotes
					expect(() => validateParsedQuery(result)).not.toThrow();
				}
			), { numRuns: 200 });
		});
	});

	describe('Filter Parsing Invariants', () => {
		it('should correctly parse simple tag filters', () => {
			fc.assert(fc.property(
				fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/), { minLength: 1, maxLength: 3 }),
				(tags) => {
					const input = tags.map(tag => `#${tag}`).join(' ');
					const result = parseQuery(input, defaultSettings);
					
					expect(result.filters.tag).toBeDefined();
					expect(result.filters.tag?.length).toBe(tags.length);
					for (const tag of tags) {
						expect(result.filters.tag).toContain(tag);
					}
				}
			), { numRuns: 200 });
		});

		it('should correctly parse simple path filters', () => {
			fc.assert(fc.property(
				fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/), { minLength: 1, maxLength: 3 }),
				(paths) => {
					const input = paths.map(path => `path:${path}`).join(' ');
					const result = parseQuery(input, defaultSettings);
					
					expect(result.filters.path).toBeDefined();
					expect(result.filters.path?.length).toBe(paths.length);
					for (const path of paths) {
						expect(result.filters.path).toContain(path);
					}
				}
			), { numRuns: 200 });
		});

		it('should correctly parse simple exclusions', () => {
			fc.assert(fc.property(
				fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/), { minLength: 1, maxLength: 3 }),
				(excludeTerms) => {
					const input = excludeTerms.map(term => `-${term}`).join(' ');
					const result = parseQuery(input, defaultSettings);
					
					expect(result.excludes.length).toBe(excludeTerms.length);
					for (const term of excludeTerms) {
						expect(result.excludes).toContain(term);
					}
				}
			), { numRuns: 200 });
		});
	});

	describe('Regex Parsing Invariants', () => {
		it('should extract well-formed regex patterns', () => {
			fc.assert(fc.property(
				fc.stringMatching(/^[a-zA-Z0-9\\.\*\+\?\|\(\)\[\]]{1,20}$/),
				fc.constantFrom('', 'i'),
				(pattern, flags) => {
					const input = `/${pattern}/${flags}`;
					
					const result = parseQuery(input, defaultSettings);
					
					// Should either parse successfully or handle gracefully
					expect(() => validateParsedQuery(result)).not.toThrow();
					
					if (result.regex) {
						expect(result.regex.source).toBe(pattern);
						expect(result.regex.flags).toBe(flags);
					}
				}
			), { numRuns: 100 });
		});

		it('should handle invalid regex gracefully', () => {
			fc.assert(fc.property(
				fc.string().filter(s => s.includes('[')), // Likely to create invalid regex
				(invalidPattern) => {
					const input = `/${invalidPattern}/i other terms`;
					
					const resultWithErrors = parseQueryWithErrors(input, defaultSettings);
					
					// Should not crash
					expect(() => validateParsedQuery(resultWithErrors.query)).not.toThrow();
					
					// Invalid regex should either be rejected or handled gracefully
					if (resultWithErrors.errors.length > 0) {
						expect(resultWithErrors.errors.some(e => e.type === 'regex')).toBe(true);
					}
				}
			), { numRuns: 100 });
		});
	});

	describe('OR Group Parsing Invariants', () => {
		it('should correctly group simple OR terms', () => {
			fc.assert(fc.property(
				fc.array(fc.stringMatching(/^[a-zA-Z0-9_]{2,8}$/), { minLength: 2, maxLength: 4 }),
				(terms) => {
					const input = terms.join(' OR ');
					const result = parseQuery(input, defaultSettings);
					
					expect(result.orGroups).toContainEqual(terms);
				}
			), { numRuns: 200 });
		});

		it('should handle mixed terms correctly', () => {
			fc.assert(fc.property(
				fc.stringMatching(/^[a-zA-Z0-9_]{2,8}$/),
				fc.stringMatching(/^[a-zA-Z0-9_]{2,8}$/),
				fc.stringMatching(/^[a-zA-Z0-9_]{2,8}$/),
				(andTerm, orTerm1, orTerm2) => {
					const input = `${andTerm} ${orTerm1} OR ${orTerm2}`;
					const result = parseQuery(input, defaultSettings);
					
					// AND term should be in regular terms
					expect(result.terms).toContain(andTerm);
					
					// OR terms should be grouped
					expect(result.orGroups).toContainEqual([orTerm1, orTerm2]);
				}
			), { numRuns: 150 });
		});
	});

	describe('Command Mode Invariants', () => {
		it('should detect commands mode with non-empty command', () => {
			fc.assert(fc.property(
				fc.string().filter(s => s.trim().length > 0),
				(commandText) => {
					const input = `>${commandText}`;
					const result = parseQuery(input, defaultSettings);
					
					expect(result.mode).toBe('commands');
					expect(result.terms).toContain(commandText.trim());
				}
			), { numRuns: 200 });
		});

		it('should handle empty commands correctly', () => {
			const result = parseQuery('>', defaultSettings);
			expect(result.mode).toBe('commands'); // > triggers commands mode even when empty
			expect(result.terms).toEqual([]); // No command text after >
			expect(() => validateParsedQuery(result)).not.toThrow();
		});
	});

	describe('Field Prefix Invariants', () => {
		it('should apply heading field prefix correctly', () => {
			fc.assert(fc.property(
				fc.array(fc.stringMatching(/^[a-zA-Z0-9_]{1,10}$/), { minLength: 1, maxLength: 3 }),
				(terms) => {
					const input = `# ${terms.join(' ')}`;
					const result = parseQuery(input, defaultSettings);
					
					expect(result.filters.field).toBe('headings');
					// All non-special terms should be in terms array
					for (const term of terms) {
						expect(result.terms).toContain(term);
					}
				}
			), { numRuns: 200 });
		});

		it('should apply symbols field prefix correctly', () => {
			fc.assert(fc.property(
				fc.array(fc.stringMatching(/^[a-zA-Z0-9_]{1,10}$/), { minLength: 1, maxLength: 3 }),
				(terms) => {
					const input = `@ ${terms.join(' ')}`;
					const result = parseQuery(input, defaultSettings);
					
					expect(result.filters.field).toBe('symbols');
					// All non-special terms should be in terms array
					for (const term of terms) {
						expect(result.terms).toContain(term);
					}
				}
			), { numRuns: 200 });
		});
	});

	describe('Idempotency and Round-trip Invariants', () => {
		it('should be deterministic for same input', () => {
			fc.assert(fc.property(
				fc.string(),
				(input) => {
					const result1 = parseQuery(input, defaultSettings);
					const result2 = parseQuery(input, defaultSettings);
					
					expect(result1).toEqual(result2);
				}
			), { numRuns: 300 });
		});

		it('should handle empty and whitespace inputs consistently', () => {
			fc.assert(fc.property(
				fc.string().filter(s => s.trim().length === 0),
				(whitespaceInput) => {
					const result = parseQuery(whitespaceInput, defaultSettings);
					
					expect(result.terms).toEqual([]);
					expect(result.phrases).toEqual([]);
					expect(result.excludes).toEqual([]);
					expect(result.orGroups).toEqual([]);
				}
			), { numRuns: 100 });
		});
	});

	describe('Edge Case Robustness', () => {
		it('should handle very long inputs without performance degradation', () => {
			fc.assert(fc.property(
				fc.string({ minLength: 1000, maxLength: 10000 }),
				(longInput) => {
					const start = performance.now();
					const result = parseQuery(longInput, defaultSettings);
					const duration = performance.now() - start;
					
					// Should complete within reasonable time (1 second)
					expect(duration).toBeLessThan(1000);
					expect(result.raw).toBe(longInput);
				}
			), { numRuns: 10 }); // Fewer runs for expensive test
		});

		it('should handle inputs with many special characters', () => {
			fc.assert(fc.property(
				fc.array(fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '+', '=', '[', ']', '{', '}', '|', '\\', ':', ';', '"', "'", '<', '>', ',', '.', '?', '/', '`', '~'), { maxLength: 50 }).map(arr => arr.join('')),
				(specialInput) => {
					const result = parseQuery(specialInput, defaultSettings);
					expect(() => validateParsedQuery(result)).not.toThrow();
				}
			), { numRuns: 200 });
		});

		it('should handle well-formed quoted structures', () => {
			fc.assert(fc.property(
				fc.array(fc.string().filter(s => !s.includes('"') && s.trim().length > 0), { minLength: 1, maxLength: 5 }),
				(phrases) => {
					const input = phrases.map(p => `"${p}"`).join(' ');
					const result = parseQuery(input, defaultSettings);
					
					// Should extract all valid phrases
					for (const phrase of phrases) {
						expect(result.phrases).toContain(phrase);
					}
				}
			), { numRuns: 200 });
		});
	});

	describe('Grammar Composition Invariants', () => {
		it('should correctly parse complex queries with all features', () => {
			fc.assert(fc.property(
				fc.record({
					terms: fc.array(fc.string().filter(s => s.length > 0 && !s.includes(' ') && s !== 'OR'), { minLength: 0, maxLength: 3 }),
					phrases: fc.array(fc.string().filter(s => !s.includes('"')), { minLength: 0, maxLength: 2 }),
					excludes: fc.array(fc.string().filter(s => s.length > 0 && !s.includes(' ')), { minLength: 0, maxLength: 2 }),
					tags: fc.array(fc.string().filter(s => s.length > 0 && !s.includes(' ') && !s.includes(':')), { minLength: 0, maxLength: 3 }),
					paths: fc.array(fc.string().filter(s => s.length > 0 && !s.includes(' ')), { minLength: 0, maxLength: 2 }),
				}),
				(components) => {
					// Build complex query
					const parts: string[] = [];
					
					// Add quotes phrases
					parts.push(...components.phrases.map(p => `"${p}"`));
					
					// Add excludes
					parts.push(...components.excludes.map(e => `-${e}`));
					
					// Add tag filters
					parts.push(...components.tags.map(t => `#${t}`));
					
					// Add path filters
					parts.push(...components.paths.map(p => `path:${p}`));
					
					// Add regular terms
					parts.push(...components.terms);
					
					const input = parts.join(' ');
					const result = parseQuery(input, defaultSettings);
					
					// Verify structure is valid
					expect(() => validateParsedQuery(result)).not.toThrow();
					
					// Check that key components are preserved
					if (components.phrases.length > 0) {
						expect(result.phrases.length).toBeGreaterThan(0);
					}
					
					if (components.excludes.length > 0) {
						expect(result.excludes.length).toBeGreaterThan(0);
					}
					
					if (components.tags.length > 0) {
						expect(result.filters.tag?.length ?? 0).toBeGreaterThan(0);
					}
					
					if (components.paths.length > 0) {
						expect(result.filters.path?.length ?? 0).toBeGreaterThan(0);
					}
				}
			), { numRuns: 100 });
		});
	});
});