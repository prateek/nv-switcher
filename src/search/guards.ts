// ABOUTME: Runtime type guards and assertions for search system types
// ABOUTME: Provides type narrowing and validation for dynamic data

import type { Doc, ParsedQuery, MatchSpan, SearchResult, QueryMode, QueryFilters } from './types';

/**
 * Type guard to check if a value is a valid Doc
 * 
 * @param v Value to check
 * @returns True if value is a Doc
 */
export function isDoc(v: unknown): v is Doc {
	if (!v || typeof v !== 'object') {
		return false;
	}
	
	const obj = v as Record<string, unknown>;
	
	return (
		typeof obj.id === 'string' &&
		typeof obj.title === 'string' &&
		Array.isArray(obj.path) &&
		obj.path.every((p: unknown) => typeof p === 'string') &&
		Array.isArray(obj.tags) &&
		obj.tags.every((t: unknown) => typeof t === 'string') &&
		Array.isArray(obj.headings) &&
		obj.headings.every((h: unknown) => typeof h === 'string') &&
		Array.isArray(obj.symbols) &&
		obj.symbols.every((s: unknown) => typeof s === 'string') &&
		typeof obj.body === 'string' &&
		typeof obj.mtime === 'number' &&
		typeof obj.size === 'number'
	);
}

/**
 * Type guard to check if a value is a valid QueryMode
 * 
 * @param v Value to check
 * @returns True if value is a QueryMode
 */
export function isQueryMode(v: unknown): v is QueryMode {
	return v === 'files' || v === 'commands';
}

/**
 * Type guard to check if a value is valid QueryFilters
 * 
 * @param v Value to check
 * @returns True if value is QueryFilters
 */
export function isQueryFilters(v: unknown): v is QueryFilters {
	if (!v || typeof v !== 'object') {
		return false;
	}
	
	const obj = v as Record<string, unknown>;
	
	// All fields are optional, so we just need to validate the ones that exist
	if (obj.tag !== undefined) {
		if (!Array.isArray(obj.tag) || !obj.tag.every((t: unknown) => typeof t === 'string')) {
			return false;
		}
	}
	
	if (obj.path !== undefined) {
		if (!Array.isArray(obj.path) || !obj.path.every((p: unknown) => typeof p === 'string')) {
			return false;
		}
	}
	
	if (obj.in !== undefined) {
		if (!Array.isArray(obj.in) || !obj.in.every((i: unknown) => typeof i === 'string')) {
			return false;
		}
	}
	
	if (obj.field !== undefined) {
		if (obj.field !== 'headings' && obj.field !== 'symbols') {
			return false;
		}
	}
	
	return true;
}

/**
 * Type guard to check if a value is a valid ParsedQuery
 * 
 * @param v Value to check
 * @returns True if value is a ParsedQuery
 */
export function isParsedQuery(v: unknown): v is ParsedQuery {
	if (!v || typeof v !== 'object') {
		return false;
	}
	
	const obj = v as Record<string, unknown>;
	
	// Check required fields
	if (
		typeof obj.raw !== 'string' ||
		!isQueryMode(obj.mode) ||
		!Array.isArray(obj.terms) ||
		!obj.terms.every((t: unknown) => typeof t === 'string') ||
		!Array.isArray(obj.phrases) ||
		!obj.phrases.every((p: unknown) => typeof p === 'string') ||
		!Array.isArray(obj.excludes) ||
		!obj.excludes.every((e: unknown) => typeof e === 'string') ||
		!Array.isArray(obj.orGroups) ||
		!obj.orGroups.every((g: unknown) => 
			Array.isArray(g) && g.every((t: unknown) => typeof t === 'string')
		) ||
		!isQueryFilters(obj.filters)
	) {
		return false;
	}
	
	// Check optional regex field
	if (obj.regex !== undefined) {
		if (!obj.regex || typeof obj.regex !== 'object') {
			return false;
		}
		const rx = obj.regex as Record<string, unknown>;
		if (typeof rx.source !== 'string' || typeof rx.flags !== 'string') {
			return false;
		}
	}
	
	return true;
}

/**
 * Type guard to check if a value is a valid MatchSpan
 * 
 * @param v Value to check
 * @returns True if value is a MatchSpan
 */
export function isMatchSpan(v: unknown): v is MatchSpan {
	if (!v || typeof v !== 'object') {
		return false;
	}
	
	const obj = v as Record<string, unknown>;
	
	// Check that field is a valid Doc key
	const validFields: Array<keyof Doc> = [
		'id', 'title', 'path', 'tags', 'headings', 'symbols', 'body', 'mtime', 'size'
	];
	
	return (
		typeof obj.field === 'string' &&
		validFields.includes(obj.field as keyof Doc) &&
		typeof obj.start === 'number' &&
		typeof obj.end === 'number' &&
		obj.start >= 0 &&
		obj.end >= obj.start
	);
}

/**
 * Type guard to check if a value is a valid SearchResult
 * 
 * @param v Value to check
 * @returns True if value is a SearchResult
 */
export function isSearchResult(v: unknown): v is SearchResult {
	if (!v || typeof v !== 'object') {
		return false;
	}
	
	const obj = v as Record<string, unknown>;
	
	return (
		typeof obj.id === 'string' &&
		typeof obj.score === 'number' &&
		Array.isArray(obj.matchSpans) &&
		obj.matchSpans.every((span: unknown) => isMatchSpan(span))
	);
}

/**
 * Assertion that throws if value is not a ParsedQuery
 * 
 * @param q Value to assert
 * @throws Error if q is not a ParsedQuery
 */
export function assertIsParsedQuery(q: unknown): asserts q is ParsedQuery {
	if (!isParsedQuery(q)) {
		throw new Error('Value is not a valid ParsedQuery');
	}
}

/**
 * Assertion that throws if value is not a Doc
 * 
 * @param d Value to assert
 * @throws Error if d is not a Doc
 */
export function assertIsDoc(d: unknown): asserts d is Doc {
	if (!isDoc(d)) {
		throw new Error('Value is not a valid Doc');
	}
}

/**
 * Assertion that throws if value is not a SearchResult
 * 
 * @param r Value to assert
 * @throws Error if r is not a SearchResult
 */
export function assertIsSearchResult(r: unknown): asserts r is SearchResult {
	if (!isSearchResult(r)) {
		throw new Error('Value is not a valid SearchResult');
	}
}

/**
 * Assertion that throws if value is not a MatchSpan
 * 
 * @param m Value to assert
 * @throws Error if m is not a MatchSpan
 */
export function assertIsMatchSpan(m: unknown): asserts m is MatchSpan {
	if (!isMatchSpan(m)) {
		throw new Error('Value is not a valid MatchSpan');
	}
}

/**
 * Validates an array of Docs
 * 
 * @param docs Array to validate
 * @returns True if all elements are valid Docs
 */
export function areValidDocs(docs: unknown[]): docs is Doc[] {
	return docs.every(isDoc);
}

/**
 * Validates an array of SearchResults
 * 
 * @param results Array to validate
 * @returns True if all elements are valid SearchResults
 */
export function areValidSearchResults(results: unknown[]): results is SearchResult[] {
	return results.every(isSearchResult);
}