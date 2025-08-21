// ABOUTME: Comprehensive tests for the query parser module
// ABOUTME: Tests field prefixes, phrases, regex, exclusions, OR logic, and commands mode

import { describe, test, expect } from 'vitest';
import { 
	parseQuery, 
	parseQueryWithErrors, 
	createQueryHighlightRegex,
	validateParsedQuery,
	createEmptyQuery
} from './query-parser';
import { ParsedQuery } from './types';

const defaultSettings = {
	commands: {
		enableCommandsPrefix: true,
		commandsPrefixChar: '>'
	},
	search: {
		diacritics: true,
		regexCandidateK: 300
	}
};

describe('Query Parser', () => {
	describe('Basic parsing', () => {
		test('empty query returns empty structure', () => {
			const result = parseQuery('', defaultSettings);
			expect(result.raw).toBe('');
			expect(result.mode).toBe('files');
			expect(result.terms).toEqual([]);
			expect(result.phrases).toEqual([]);
			expect(result.excludes).toEqual([]);
			expect(result.orGroups).toEqual([]);
			expect(result.filters).toEqual({});
		});

		test('whitespace-only query returns empty structure', () => {
			const result = parseQuery('   \t\n  ', defaultSettings);
			expect(result.terms).toEqual([]);
			expect(result.mode).toBe('files');
		});

		test('simple term query', () => {
			const result = parseQuery('hello', defaultSettings);
			expect(result.terms).toEqual(['hello']);
			expect(result.mode).toBe('files');
			expect(result.raw).toBe('hello');
		});

		test('multiple terms query', () => {
			const result = parseQuery('hello world test', defaultSettings);
			expect(result.terms).toEqual(['hello', 'world', 'test']);
		});
	});

	describe('Commands mode', () => {
		test('commands prefix triggers commands mode', () => {
			const result = parseQuery('>test command', defaultSettings);
			expect(result.mode).toBe('commands');
			expect(result.terms).toEqual(['test command']);
			expect(result.raw).toBe('>test command');
		});

		test('empty command after prefix', () => {
			const result = parseQuery('>', defaultSettings);
			expect(result.mode).toBe('commands');
			expect(result.terms).toEqual([]);
		});

		test('commands mode disabled', () => {
			const settings = {
				...defaultSettings,
				commands: { ...defaultSettings.commands, enableCommandsPrefix: false }
			};
			const result = parseQuery('>test', settings);
			expect(result.mode).toBe('files');
			expect(result.terms).toEqual(['>test']);
		});

		test('custom commands prefix character', () => {
			const settings = {
				...defaultSettings,
				commands: { ...defaultSettings.commands, commandsPrefixChar: '!' }
			};
			const result = parseQuery('!test command', settings);
			expect(result.mode).toBe('commands');
			expect(result.terms).toEqual(['test command']);
		});
	});

	describe('Field prefixes', () => {
		test('headings field prefix', () => {
			const result = parseQuery('# test', defaultSettings);
			expect(result.filters.field).toBe('headings');
			expect(result.terms).toEqual(['test']);
		});

		test('symbols field prefix', () => {
			const result = parseQuery('@ symbol', defaultSettings);
			expect(result.filters.field).toBe('symbols');
			expect(result.terms).toEqual(['symbol']);
		});

		test('lone # prefix without terms', () => {
			const result = parseQuery('#', defaultSettings);
			expect(result.filters.field).toBe('headings');
			expect(result.terms).toEqual([]);
		});

		test('lone @ prefix without terms', () => {
			const result = parseQuery('@', defaultSettings);
			expect(result.filters.field).toBe('symbols');
			expect(result.terms).toEqual([]);
		});
	});

	describe('Tag filters', () => {
		test('tag: prefix filter', () => {
			const result = parseQuery('tag:work test', defaultSettings);
			expect(result.filters.tag).toEqual(['work']);
			expect(result.terms).toEqual(['test']);
		});

		test('# token tag filter', () => {
			const result = parseQuery('#work test', defaultSettings);
			expect(result.filters.tag).toEqual(['work']);
			expect(result.terms).toEqual(['test']);
		});

		test('multiple tag filters', () => {
			const result = parseQuery('tag:work #project tag:urgent', defaultSettings);
			expect(result.filters.tag).toEqual(['work', 'project', 'urgent']);
		});

		test('empty tag value ignored', () => {
			const result = parseQuery('tag: test', defaultSettings);
			expect(result.filters.tag).toBeUndefined();
			expect(result.terms).toEqual(['test']);
		});
	});

	describe('Path filters', () => {
		test('path: prefix filter', () => {
			const result = parseQuery('path:projects/work test', defaultSettings);
			expect(result.filters.path).toEqual(['projects/work']);
			expect(result.terms).toEqual(['test']);
		});

		test('multiple path filters', () => {
			const result = parseQuery('path:proj path:work/docs', defaultSettings);
			expect(result.filters.path).toEqual(['proj', 'work/docs']);
		});

		test('in: folder filter', () => {
			const result = parseQuery('in:Inbox test', defaultSettings);
			expect(result.filters.in).toEqual(['Inbox']);
			expect(result.terms).toEqual(['test']);
		});

		test('multiple in: filters', () => {
			const result = parseQuery('in:Inbox in:Archive', defaultSettings);
			expect(result.filters.in).toEqual(['Inbox', 'Archive']);
		});
	});

	describe('Quoted phrases', () => {
		test('single quoted phrase', () => {
			const result = parseQuery('"exact phrase" test', defaultSettings);
			expect(result.phrases).toEqual(['exact phrase']);
			expect(result.terms).toEqual(['test']);
		});

		test('multiple quoted phrases', () => {
			const result = parseQuery('"first phrase" "second phrase"', defaultSettings);
			expect(result.phrases).toEqual(['first phrase', 'second phrase']);
		});

		test('phrase with mixed content', () => {
			const result = parseQuery('before "exact phrase" after', defaultSettings);
			expect(result.phrases).toEqual(['exact phrase']);
			expect(result.terms).toEqual(['before', 'after']);
		});

		test('empty quoted phrase ignored', () => {
			const result = parseQuery('"" test', defaultSettings);
			expect(result.phrases).toEqual([]);
			expect(result.terms).toEqual(['test']);
		});

		test('unclosed quote treated as term', () => {
			const result = parseQuery('"unclosed test', defaultSettings);
			expect(result.phrases).toEqual([]);
			expect(result.terms).toEqual(['"unclosed', 'test']);
		});
	});

	describe('Exclusions', () => {
		test('single exclusion', () => {
			const result = parseQuery('test -exclude', defaultSettings);
			expect(result.terms).toEqual(['test']);
			expect(result.excludes).toEqual(['exclude']);
		});

		test('multiple exclusions', () => {
			const result = parseQuery('test -first -second', defaultSettings);
			expect(result.terms).toEqual(['test']);
			expect(result.excludes).toEqual(['first', 'second']);
		});

		test('lone dash not treated as exclusion', () => {
			const result = parseQuery('test -', defaultSettings);
			expect(result.terms).toEqual(['test', '-']);
			expect(result.excludes).toEqual([]);
		});

		test('exclusion with special characters', () => {
			const result = parseQuery('test -file.txt', defaultSettings);
			expect(result.excludes).toEqual(['file.txt']);
		});
	});

	describe('OR groups', () => {
		test('simple OR group', () => {
			const result = parseQuery('first OR second', defaultSettings);
			expect(result.orGroups).toEqual([['first', 'second']]);
			expect(result.terms).toEqual([]);
		});

		test('OR group with additional terms', () => {
			const result = parseQuery('test first OR second', defaultSettings);
			expect(result.terms).toEqual(['test']);
			expect(result.orGroups).toEqual([['first', 'second']]);
		});

		test('multiple OR groups', () => {
			const result = parseQuery('first OR second third OR fourth', defaultSettings);
			expect(result.orGroups).toEqual([['first', 'second'], ['third', 'fourth']]);
		});

		test('three-term OR group', () => {
			const result = parseQuery('first OR second OR third', defaultSettings);
			expect(result.orGroups).toEqual([['first', 'second', 'third']]);
		});

		test('case-insensitive OR', () => {
			const result = parseQuery('first or second', defaultSettings);
			expect(result.orGroups).toEqual([['first', 'second']]);
		});

		test('mixed case OR', () => {
			const result = parseQuery('first Or second', defaultSettings);
			expect(result.orGroups).toEqual([['first', 'second']]);
		});
	});

	describe('Regex patterns', () => {
		test('valid regex pattern', () => {
			const result = parseQuery('test /pattern/', defaultSettings);
			expect(result.terms).toEqual(['test']);
			expect(result.regex).toEqual({ source: 'pattern', flags: '' });
		});

		test('regex with flags', () => {
			const result = parseQuery('/pattern/i', defaultSettings);
			expect(result.regex).toEqual({ source: 'pattern', flags: 'i' });
		});

		test('regex with escaped characters', () => {
			const result = parseQuery('/test\\.txt/', defaultSettings);
			expect(result.regex).toEqual({ source: 'test\\.txt', flags: '' });
		});

		test('regex with forward slash', () => {
			const result = parseQuery('/test\\/path/', defaultSettings);
			expect(result.regex).toEqual({ source: 'test\\/path', flags: '' });
		});

		test('invalid regex pattern handled gracefully', () => {
			const result = parseQueryWithErrors('/[invalid/', defaultSettings);
			expect(result.query.regex).toBeUndefined();
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].type).toBe('regex');
		});

		test('multiple regex patterns - only first one used', () => {
			const result = parseQuery('/first/ /second/', defaultSettings);
			expect(result.regex).toEqual({ source: 'first', flags: '' });
		});
	});

	describe('Complex queries', () => {
		test('comprehensive query with all features', () => {
			const result = parseQuery('tag:work "exact phrase" first OR second -exclude /pattern/i @ test', defaultSettings);
			
			expect(result.filters.tag).toEqual(['work']);
			expect(result.filters.field).toBe('symbols');
			expect(result.phrases).toEqual(['exact phrase']);
			expect(result.orGroups).toEqual([['first', 'second']]);
			expect(result.excludes).toEqual(['exclude']);
			expect(result.regex).toEqual({ source: 'pattern', flags: 'i' });
			expect(result.terms).toEqual(['test']);
		});

		test('path and tag filters combined', () => {
			const result = parseQuery('path:projects #work in:Archive test', defaultSettings);
			expect(result.filters.path).toEqual(['projects']);
			expect(result.filters.tag).toEqual(['work']);
			expect(result.filters.in).toEqual(['Archive']);
			expect(result.terms).toEqual(['test']);
		});

		test('mixed OR groups and phrases', () => {
			const result = parseQuery('"exact phrase" first OR second "another phrase"', defaultSettings);
			expect(result.phrases).toEqual(['exact phrase', 'another phrase']);
			expect(result.orGroups).toEqual([['first', 'second']]);
		});
	});

	describe('Edge cases', () => {
		test('consecutive OR operators', () => {
			const result = parseQuery('first OR OR second', defaultSettings);
			expect(result.orGroups).toEqual([['first', 'second']]);
		});

		test('OR at start of query', () => {
			const result = parseQuery('OR first second', defaultSettings);
			expect(result.terms).toEqual(['first', 'second']);
			expect(result.orGroups).toEqual([]);
		});

		test('OR at end of query', () => {
			const result = parseQuery('first second OR', defaultSettings);
			expect(result.terms).toEqual(['first', 'second']);
			expect(result.orGroups).toEqual([]);
		});

		test('nested quotes treated as separate phrases', () => {
			const result = parseQuery('"outer "inner" text"', defaultSettings);
			expect(result.phrases).toEqual(['outer ', ' text']);
			expect(result.terms).toEqual(['inner']);
		});

		test('special characters in terms', () => {
			const result = parseQuery('file.txt test@example.com', defaultSettings);
			expect(result.terms).toEqual(['file.txt', 'test@example.com']);
		});
	});

	describe('Query validation', () => {
		test('valid query passes validation', () => {
			const query = parseQuery('test query', defaultSettings);
			expect(validateParsedQuery(query)).toBe(true);
		});

		test('invalid query structure fails validation', () => {
			expect(validateParsedQuery(null as any)).toBe(false);
			expect(validateParsedQuery({} as any)).toBe(false);
			expect(validateParsedQuery({ raw: 'test' } as any)).toBe(false);
		});

		test('invalid OR groups structure fails validation', () => {
			const invalidQuery = {
				...parseQuery('test', defaultSettings),
				orGroups: [['valid'], 'invalid']
			};
			expect(validateParsedQuery(invalidQuery as any)).toBe(false);
		});

		test('invalid filters structure fails validation', () => {
			const invalidQuery = {
				...parseQuery('test', defaultSettings),
				filters: { tag: 'not-array' }
			};
			expect(validateParsedQuery(invalidQuery as any)).toBe(false);
		});
	});

	describe('Highlight regex creation', () => {
		test('creates regex for terms and phrases', () => {
			const query = parseQuery('hello "world test" cafe', defaultSettings);
			const regex = createQueryHighlightRegex(query, true);
			
			expect(regex).toBeInstanceOf(RegExp);
			expect(regex!.flags).toContain('i');
			expect(regex!.source).toMatch(/hello/);
			expect(regex!.source).toMatch(/world/);
			expect(regex!.source).toMatch(/test/);
			expect(regex!.source).toMatch(/cafe/);
		});

		test('includes OR group terms in highlight', () => {
			const query = parseQuery('first OR second third', defaultSettings);
			const regex = createQueryHighlightRegex(query, true);
			
			expect(regex!.source).toMatch(/first/);
			expect(regex!.source).toMatch(/second/);
			expect(regex!.source).toMatch(/third/);
		});

		test('excludes are not included in highlight regex', () => {
			const query = parseQuery('include -exclude', defaultSettings);
			const regex = createQueryHighlightRegex(query, true);
			
			expect(regex!.source).toMatch(/include/);
			expect(regex!.source).not.toMatch(/exclude/);
		});

		test('empty query returns undefined regex', () => {
			const query = parseQuery('', defaultSettings);
			const regex = createQueryHighlightRegex(query, true);
			
			expect(regex).toBeUndefined();
		});
	});

	describe('Empty query creation', () => {
		test('creates valid empty files query', () => {
			const query = createEmptyQuery('files');
			expect(query.mode).toBe('files');
			expect(query.raw).toBe('');
			expect(query.terms).toEqual([]);
			expect(validateParsedQuery(query)).toBe(true);
		});

		test('creates valid empty commands query', () => {
			const query = createEmptyQuery('commands');
			expect(query.mode).toBe('commands');
			expect(validateParsedQuery(query)).toBe(true);
		});

		test('defaults to files mode', () => {
			const query = createEmptyQuery();
			expect(query.mode).toBe('files');
		});
	});

	describe('Error handling', () => {
		test('parseQueryWithErrors returns regex errors', () => {
			const result = parseQueryWithErrors('test /[invalid/', defaultSettings);
			
			expect(result.query.regex).toBeUndefined();
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].type).toBe('regex');
			expect(result.errors[0].message).toContain('Invalid regex');
		});

		test('parseQuery ignores errors and returns clean query', () => {
			const query = parseQuery('test /[invalid/', defaultSettings);
			
			expect(query.regex).toBeUndefined();
			expect(query.terms).toEqual(['test']);
			// parseQuery doesn't expose errors
		});
	});
});