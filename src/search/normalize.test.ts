// ABOUTME: Unit tests for text normalization and tokenization utilities
// ABOUTME: Verifies normalize.ts functions behave correctly with various inputs

import { describe, it, expect } from 'vitest';
import {
	normalizeText,
	tokenizeWords,
	maybeNormalizeRegex,
	escapeRegex,
	createHighlightRegex,
	compareStrings
} from './normalize';

describe('normalizeText', () => {
	describe('with diacritics preserved', () => {
		it('should lowercase text but keep diacritics', () => {
			expect(normalizeText('Café', true)).toBe('café');
			expect(normalizeText('NAÏVE', true)).toBe('naïve');
			expect(normalizeText('Résumé', true)).toBe('résumé');
			expect(normalizeText('Zürich', true)).toBe('zürich');
		});
		
		it('should preserve whitespace', () => {
			expect(normalizeText('Hello  World', true)).toBe('hello  world');
			expect(normalizeText('Tab\tSeparated', true)).toBe('tab\tseparated');
			expect(normalizeText('New\nLine', true)).toBe('new\nline');
		});
	});
	
	describe('with diacritics removed', () => {
		it('should lowercase and remove diacritics', () => {
			expect(normalizeText('Café', false)).toBe('cafe');
			expect(normalizeText('NAÏVE', false)).toBe('naive');
			expect(normalizeText('Résumé', false)).toBe('resume');
			expect(normalizeText('Zürich', false)).toBe('zurich');
		});
		
		it('should handle various Unicode diacritics', () => {
			expect(normalizeText('àáâãäå', false)).toBe('aaaaaa');
			expect(normalizeText('èéêë', false)).toBe('eeee');
			expect(normalizeText('ìíîï', false)).toBe('iiii');
			expect(normalizeText('òóôõö', false)).toBe('ooooo');
			expect(normalizeText('ùúûü', false)).toBe('uuuu');
			expect(normalizeText('ñ', false)).toBe('n');
			expect(normalizeText('ç', false)).toBe('c');
		});
		
		it('should preserve whitespace when removing diacritics', () => {
			expect(normalizeText('Café au lait', false)).toBe('cafe au lait');
			expect(normalizeText('Naïve résumé', false)).toBe('naive resume');
		});
	});
	
	it('should handle empty strings', () => {
		expect(normalizeText('', true)).toBe('');
		expect(normalizeText('', false)).toBe('');
	});
	
	it('should handle strings without diacritics', () => {
		expect(normalizeText('Hello World', true)).toBe('hello world');
		expect(normalizeText('Hello World', false)).toBe('hello world');
	});
});

describe('tokenizeWords', () => {
	it('should tokenize basic words', () => {
		expect(tokenizeWords('Hello World', true)).toEqual(['hello', 'world']);
		expect(tokenizeWords('one two three', true)).toEqual(['one', 'two', 'three']);
	});
	
	it('should handle punctuation', () => {
		expect(tokenizeWords('Hello, World!', true)).toEqual(['hello', 'world']);
		expect(tokenizeWords('test-case', true)).toEqual(['test', 'case']);
		expect(tokenizeWords('user@example.com', true)).toEqual(['user', 'example', 'com']);
	});
	
	it('should handle numbers', () => {
		expect(tokenizeWords('abc 123 def', true)).toEqual(['abc', '123', 'def']);
		expect(tokenizeWords('version-2.0.1', true)).toEqual(['version', '2', '0', '1']);
	});
	
	it('should handle Unicode letters', () => {
		expect(tokenizeWords('café société', true)).toEqual(['café', 'société']);
		expect(tokenizeWords('日本語 テスト', true)).toEqual(['日本語', 'テスト']);
		expect(tokenizeWords('Привет мир', true)).toEqual(['привет', 'мир']);
	});
	
	it('should apply diacritic folding when requested', () => {
		expect(tokenizeWords('Café Société', false)).toEqual(['cafe', 'societe']);
		expect(tokenizeWords('naïve résumé', false)).toEqual(['naive', 'resume']);
	});
	
	it('should handle empty and whitespace strings', () => {
		expect(tokenizeWords('', true)).toEqual([]);
		expect(tokenizeWords('   ', true)).toEqual([]);
		expect(tokenizeWords('\t\n', true)).toEqual([]);
	});
	
	it('should handle underscores and other connectors', () => {
		expect(tokenizeWords('snake_case_name', true)).toEqual(['snake', 'case', 'name']);
		expect(tokenizeWords('kebab-case-name', true)).toEqual(['kebab', 'case', 'name']);
	});
});

describe('maybeNormalizeRegex', () => {
	it('should create valid RegExp from valid pattern', () => {
		const regex = maybeNormalizeRegex({ source: 'test.*', flags: 'i' });
		expect(regex).toBeInstanceOf(RegExp);
		expect(regex?.source).toBe('test.*');
		expect(regex?.flags).toBe('i');
	});
	
	it('should handle multiple flags', () => {
		const regex = maybeNormalizeRegex({ source: 'pattern', flags: 'gim' });
		expect(regex).toBeInstanceOf(RegExp);
		expect(regex?.flags).toBe('gim');
	});
	
	it('should return undefined for invalid regex', () => {
		expect(maybeNormalizeRegex({ source: '[invalid', flags: '' })).toBeUndefined();
		expect(maybeNormalizeRegex({ source: '(unclosed', flags: '' })).toBeUndefined();
		expect(maybeNormalizeRegex({ source: '*invalid', flags: '' })).toBeUndefined();
	});
	
	it('should return undefined for undefined input', () => {
		expect(maybeNormalizeRegex(undefined)).toBeUndefined();
	});
	
	it('should handle empty pattern', () => {
		const regex = maybeNormalizeRegex({ source: '', flags: '' });
		expect(regex).toBeInstanceOf(RegExp);
		expect(regex?.source).toBe('(?:)'); // Empty pattern representation
	});
	
	it('should not throw errors', () => {
		expect(() => maybeNormalizeRegex({ source: '[invalid', flags: '' })).not.toThrow();
		expect(() => maybeNormalizeRegex(undefined)).not.toThrow();
	});
});

describe('escapeRegex', () => {
	it('should escape special regex characters', () => {
		expect(escapeRegex('.')).toBe('\\.');
		expect(escapeRegex('*')).toBe('\\*');
		expect(escapeRegex('+')).toBe('\\+');
		expect(escapeRegex('?')).toBe('\\?');
		expect(escapeRegex('^')).toBe('\\^');
		expect(escapeRegex('$')).toBe('\\$');
		expect(escapeRegex('{')).toBe('\\{');
		expect(escapeRegex('}')).toBe('\\}');
		expect(escapeRegex('(')).toBe('\\(');
		expect(escapeRegex(')')).toBe('\\)');
		expect(escapeRegex('|')).toBe('\\|');
		expect(escapeRegex('[')).toBe('\\[');
		expect(escapeRegex(']')).toBe('\\]');
		expect(escapeRegex('\\')).toBe('\\\\');
	});
	
	it('should escape multiple special characters', () => {
		expect(escapeRegex('file.txt')).toBe('file\\.txt');
		expect(escapeRegex('[test]')).toBe('\\[test\\]');
		expect(escapeRegex('a|b')).toBe('a\\|b');
		expect(escapeRegex('$100.00')).toBe('\\$100\\.00');
	});
	
	it('should not escape normal characters', () => {
		expect(escapeRegex('hello world')).toBe('hello world');
		expect(escapeRegex('abc123')).toBe('abc123');
		expect(escapeRegex('test-case')).toBe('test-case');
	});
	
	it('should handle empty string', () => {
		expect(escapeRegex('')).toBe('');
	});
});

describe('createHighlightRegex', () => {
	it('should create regex for single term', () => {
		const regex = createHighlightRegex(['test'], true);
		expect(regex).toBeInstanceOf(RegExp);
		expect('test'.match(regex)).toBeTruthy();
		expect('testing'.match(regex)).toBeTruthy();
		expect('contest'.match(regex)).toBeTruthy();
	});
	
	it('should create regex for multiple terms', () => {
		const regex = createHighlightRegex(['test', 'demo'], true);
		expect(regex).toBeInstanceOf(RegExp);
		expect('test'.match(regex)).toBeTruthy();
		expect('demo'.match(regex)).toBeTruthy();
		expect('demonstration'.match(regex)).toBeTruthy();
	});
	
	it('should handle diacritic folding', () => {
		const regex = createHighlightRegex(['café'], false);
		expect(regex).toBeInstanceOf(RegExp);
		// The regex will match the normalized version
		expect('cafe'.match(regex)).toBeTruthy();
	});
	
	it('should escape special characters in terms', () => {
		const regex = createHighlightRegex(['file.txt'], true);
		expect(regex).toBeInstanceOf(RegExp);
		expect('file.txt'.match(regex)).toBeTruthy();
		expect('filextxt'.match(regex)).toBeFalsy(); // Dot should be escaped
	});
	
	it('should return undefined for empty array', () => {
		expect(createHighlightRegex([], true)).toBeUndefined();
	});
	
	it('should filter out empty terms', () => {
		expect(createHighlightRegex(['', 'test', ''], true)).toBeInstanceOf(RegExp);
	});
	
	it('should be case-insensitive', () => {
		const regex = createHighlightRegex(['test'], true);
		expect('TEST'.match(regex)).toBeTruthy();
		expect('Test'.match(regex)).toBeTruthy();
		expect('TeSt'.match(regex)).toBeTruthy();
	});
});

describe('compareStrings', () => {
	describe('with diacritics', () => {
		it('should compare strings case-insensitively', () => {
			expect(compareStrings('Hello', 'hello', true)).toBe(true);
			expect(compareStrings('WORLD', 'world', true)).toBe(true);
		});
		
		it('should distinguish diacritics', () => {
			expect(compareStrings('Café', 'cafe', true)).toBe(false);
			expect(compareStrings('café', 'café', true)).toBe(true);
			expect(compareStrings('Café', 'Café', true)).toBe(true);
		});
	});
	
	describe('without diacritics', () => {
		it('should ignore diacritics in comparison', () => {
			expect(compareStrings('Café', 'cafe', false)).toBe(true);
			expect(compareStrings('CAFÉ', 'cafe', false)).toBe(true);
			expect(compareStrings('naïve', 'naive', false)).toBe(true);
			expect(compareStrings('résumé', 'resume', false)).toBe(true);
		});
		
		it('should still be case-insensitive', () => {
			expect(compareStrings('Hello', 'HELLO', false)).toBe(true);
			expect(compareStrings('World', 'world', false)).toBe(true);
		});
	});
	
	it('should handle empty strings', () => {
		expect(compareStrings('', '', true)).toBe(true);
		expect(compareStrings('', '', false)).toBe(true);
		expect(compareStrings('test', '', true)).toBe(false);
		expect(compareStrings('', 'test', false)).toBe(false);
	});
	
	it('should handle whitespace', () => {
		expect(compareStrings('hello world', 'hello world', true)).toBe(true);
		expect(compareStrings('hello  world', 'hello world', true)).toBe(false);
		expect(compareStrings('hello\tworld', 'hello world', true)).toBe(false);
	});
});

describe('Edge Cases and Unicode Support', () => {
	it('should handle emoji and special characters', () => {
		expect(normalizeText('Hello 👋 World', true)).toBe('hello 👋 world');
		expect(tokenizeWords('test 😀 emoji', true)).toEqual(['test', 'emoji']);
	});
	
	it('should handle CJK characters', () => {
		expect(normalizeText('中文測試', true)).toBe('中文測試');
		expect(tokenizeWords('中文 English 混合', true)).toEqual(['中文', 'english', '混合']);
	});
	
	it('should handle RTL scripts', () => {
		expect(normalizeText('مرحبا', true)).toBe('مرحبا');
		expect(normalizeText('שלום', true)).toBe('שלום');
	});
	
	it('should handle combining characters properly', () => {
		// e + combining acute accent: preserved when diacritics=true, removed when false
		const combining = 'e\u0301'; // e + combining acute
		// When preserving diacritics, just lowercase (may stay as combining form)
		expect(normalizeText(combining, true)).toBe('e\u0301');
		// When removing diacritics, strip the combining mark
		expect(normalizeText(combining, false)).toBe('e');
	});
});