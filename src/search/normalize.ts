// ABOUTME: Text normalization and tokenization utilities for search operations
// ABOUTME: Handles diacritic folding, case normalization, and safe regex construction

/**
 * Normalizes text for search operations with optional diacritic folding.
 * 
 * @param str The input string to normalize
 * @param diacritics If true, preserve diacritics; if false, remove them
 * @returns Normalized string (lowercase, optionally without diacritics)
 * 
 * @example
 * normalizeText('Café', true)  // => 'café'
 * normalizeText('Café', false) // => 'cafe'
 * normalizeText('Naïve résumé', false) // => 'naive resume'
 */
export function normalizeText(str: string, diacritics: boolean): string {
	// Always lowercase first
	let normalized = str.toLowerCase();
	
	// If diacritics should be removed, apply NFD and strip combining marks
	if (!diacritics) {
		// Normalize to NFD (decomposed form) where é becomes e + combining accent
		normalized = normalized.normalize('NFD');
		// Remove all combining marks (Unicode category M)
		// This regex uses Unicode property escapes to match combining marks
		normalized = normalized.replace(/[\u0300-\u036f]/g, '');
	}
	
	return normalized;
}

/**
 * Tokenizes input text into words, applying normalization.
 * Splits on word boundaries while preserving Unicode letters and numbers.
 * 
 * @param input The text to tokenize
 * @param diacritics Whether to preserve diacritics in tokens
 * @returns Array of normalized word tokens
 * 
 * @example
 * tokenizeWords('Hello, world! 123', true) // => ['hello', 'world', '123']
 * tokenizeWords('Café-société', false) // => ['cafe', 'societe']
 * tokenizeWords('hello_world-test', true) // => ['hello', 'world', 'test']
 */
export function tokenizeWords(input: string, diacritics: boolean = true): string[] {
	// First normalize the entire input
	const normalized = normalizeText(input, diacritics);
	
	// Split on non-word characters while preserving Unicode letters and numbers
	// This regex matches sequences of Unicode letters and/or numbers
	const tokens = normalized.match(/[\p{Letter}\p{Number}]+/gu) || [];
	
	return tokens;
}

/**
 * Safely constructs a RegExp from pattern and flags, returning undefined on failure.
 * Useful for providers to handle user-provided regex patterns safely.
 * 
 * @param rx Optional regex specification with source and flags
 * @returns Valid RegExp instance or undefined if construction fails
 * 
 * @example
 * maybeNormalizeRegex({ source: 'test.*', flags: 'i' }) // Returns a RegExp
 * maybeNormalizeRegex({ source: '[invalid', flags: '' }) // Returns undefined
 * maybeNormalizeRegex(undefined) // Returns undefined
 */
export function maybeNormalizeRegex(rx?: { source: string; flags: string }): RegExp | undefined {
	if (!rx) {
		return undefined;
	}
	
	try {
		// Attempt to construct the RegExp
		return new RegExp(rx.source, rx.flags);
	} catch (error) {
		// Invalid regex pattern - return undefined instead of throwing
		return undefined;
	}
}

/**
 * Escapes special regex characters in a string for use in RegExp constructor.
 * Useful when building regex patterns from user input that should be treated literally.
 * 
 * @param str String to escape
 * @returns String with regex special characters escaped
 * 
 * @example
 * escapeRegex('file.txt') // => 'file\\.txt'
 * escapeRegex('[test]') // => '\\[test\\]'
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Creates a regex pattern for highlighting search terms in text.
 * Handles word boundaries intelligently to match whole words when appropriate.
 * 
 * @param terms Array of search terms to highlight
 * @param diacritics Whether to preserve diacritics in matching
 * @returns RegExp for matching any of the terms, or undefined if no valid terms
 * 
 * @example
 * createHighlightRegex(['test', 'demo'], true) // Returns regex matching test or demo
 * createHighlightRegex(['café'], false) // Matches both 'café' and 'cafe'
 */
export function createHighlightRegex(terms: string[], diacritics: boolean = true): RegExp | undefined {
	if (!terms || terms.length === 0) {
		return undefined;
	}
	
	// Normalize and escape each term
	const escapedTerms = terms
		.map(term => normalizeText(term, diacritics))
		.filter(term => term.length > 0)
		.map(term => escapeRegex(term));
	
	if (escapedTerms.length === 0) {
		return undefined;
	}
	
	// Build pattern without word boundaries for partial matching
	// This allows matching "test" in "testing" which is expected behavior for highlighting
	const pattern = escapedTerms.join('|');
	
	// Create regex with case-insensitive flag
	// If diacritics are being folded, the pattern already handles it via normalization
	return new RegExp(`(${pattern})`, 'gi');
}

/**
 * Compares two strings for equality with optional diacritic folding.
 * Useful for exact match checks in search operations.
 * 
 * @param a First string
 * @param b Second string
 * @param diacritics Whether to consider diacritics in comparison
 * @returns True if strings are equal after normalization
 * 
 * @example
 * compareStrings('Café', 'cafe', false) // => true
 * compareStrings('Café', 'cafe', true) // => false
 */
export function compareStrings(a: string, b: string, diacritics: boolean = true): boolean {
	return normalizeText(a, diacritics) === normalizeText(b, diacritics);
}