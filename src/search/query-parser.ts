// ABOUTME: Advanced query parser supporting field prefixes, phrases, regex, and command mode
// ABOUTME: Transforms user input strings into structured ParsedQuery objects for search providers

import { ParsedQuery, QueryMode, QueryFilters } from './types';
import { createHighlightRegex, escapeRegex } from './normalize';

/**
 * Settings interface for query parsing
 */
interface QueryParserSettings {
	commands: {
		enableCommandsPrefix: boolean;
		commandsPrefixChar: string;
	};
	search: {
		diacritics: boolean;
		regexCandidateK: number;
	};
}

/**
 * Parse error details
 */
interface ParseError {
	type: 'regex' | 'syntax';
	message: string;
	position?: number;
}

/**
 * Result of parsing operation
 */
interface ParseResult {
	query: ParsedQuery;
	errors: ParseError[];
}

/**
 * Parses a user query string into a structured ParsedQuery object.
 * Supports field prefixes, quoted phrases, regex patterns, exclusions, and command mode.
 * 
 * @param input Raw query string from user
 * @param settings Plugin settings for parsing behavior
 * @returns Parsed query with structured components
 * 
 * @example
 * parseQuery('tag:work "exact phrase" -exclude /regex/i', settings)
 * // Returns query with tags filter, phrase, exclusion, and regex
 */
export function parseQuery(input: string, settings: QueryParserSettings): ParsedQuery {
	const result = parseQueryWithErrors(input, settings);
	return result.query;
}

/**
 * Parses query and returns both result and any parse errors.
 * Useful for providing user feedback on invalid input.
 * 
 * @param input Raw query string
 * @param settings Plugin settings
 * @returns Parse result with query and error list
 */
export function parseQueryWithErrors(input: string, settings: QueryParserSettings): ParseResult {
	const errors: ParseError[] = [];
	const trimmed = input.trim();
	
	// Determine query mode based on commands prefix
	const mode: QueryMode = isCommandsQuery(trimmed, settings) ? 'commands' : 'files';
	
	// For commands mode, return minimal parsing
	if (mode === 'commands') {
		const commandQuery = trimmed.slice(settings.commands.commandsPrefixChar.length).trim();
		return {
			query: {
				raw: input,
				mode,
				terms: commandQuery ? [commandQuery] : [],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			},
			errors
		};
	}
	
	// Parse files mode query
	let remaining = trimmed;
	const phrases: string[] = [];
	const filters: QueryFilters = {};
	let regexSpec: { source: string; flags: string } | undefined;
	
	// Step 1: Extract quoted phrases
	const phraseMatches = remaining.matchAll(/"([^"]+)"/g);
	for (const match of phraseMatches) {
		if (match[1]) {
			phrases.push(match[1]);
		}
	}
	// Remove phrases from remaining text
	remaining = remaining.replace(/"[^"]*"/g, '').trim();
	
	// Step 2: Extract regex patterns
	const regexMatch = remaining.match(/\/((?:\\\/|[^\/])+?)\/(i?)/);
	if (regexMatch) {
		const [fullMatch, pattern, flags] = regexMatch;
		try {
			// Validate regex by attempting to construct it
			new RegExp(pattern, flags);
			regexSpec = { source: pattern, flags };
		} catch (e) {
			errors.push({
				type: 'regex',
				message: `Invalid regex pattern: ${e instanceof Error ? e.message : 'Unknown error'}`,
				position: remaining.indexOf(fullMatch)
			});
		}
		// Remove regex from remaining text
		remaining = remaining.replace(/\/((?:\\\/|[^\/])+?)\/(i?)/, '').trim();
	}
	
	// Step 3: Tokenize remaining text and classify tokens
	const tokens = remaining.split(/\s+/).filter(token => token.length > 0);
	const terms: string[] = [];
	const excludes: string[] = [];
	const orGroups: string[][] = [];
	let currentOrGroup: string[] = [];
	let inOrGroup = false;
	let fieldPrefix: 'headings' | 'symbols' | undefined;
	
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		
		// Handle OR operator (case-insensitive)
		if (token.toUpperCase() === 'OR') {
			if (!inOrGroup && terms.length > 0) {
				// Start new OR group with previous term
				currentOrGroup = [terms.pop()!];
				inOrGroup = true;
			}
			continue;
		}
		
		// Handle exclusions (terms starting with -)
		if (token.startsWith('-') && token.length > 1) {
			const excludeTerm = token.slice(1);
			excludes.push(excludeTerm);
			continue;
		}
		
		// Handle field prefixes
		if (token === '#') {
			fieldPrefix = 'headings';
			continue;
		}
		
		if (token === '@') {
			fieldPrefix = 'symbols';
			continue;
		}
		
		// Handle tag filters (tag:value or #value as token)
		if (token.startsWith('tag:')) {
			const tagValue = token.slice(4);
			if (tagValue) {
				filters.tag = filters.tag || [];
				filters.tag.push(tagValue);
			}
			continue;
		}
		
		if (token.startsWith('#') && token.length > 1) {
			const tagValue = token.slice(1);
			filters.tag = filters.tag || [];
			filters.tag.push(tagValue);
			continue;
		}
		
		// Handle path filters
		if (token.startsWith('path:')) {
			const pathValue = token.slice(5);
			if (pathValue) {
				filters.path = filters.path || [];
				filters.path.push(pathValue);
			}
			continue;
		}
		
		// Handle in filters (folder containment)
		if (token.startsWith('in:')) {
			const inValue = token.slice(3);
			if (inValue) {
				filters.in = filters.in || [];
				filters.in.push(inValue);
			}
			continue;
		}
		
		// Regular term
		if (inOrGroup) {
			currentOrGroup.push(token);
		} else {
			// Check if next token is OR to start a group
			if (i + 1 < tokens.length && tokens[i + 1].toUpperCase() === 'OR') {
				// Start OR group with current term
				currentOrGroup = [token];
				inOrGroup = true;
			} else {
				terms.push(token);
			}
		}
		
		// If we're in an OR group and next token is not OR, end the group
		if (inOrGroup && (i + 1 >= tokens.length || tokens[i + 1].toUpperCase() !== 'OR')) {
			// Only add OR group if we have at least 2 terms
			if (currentOrGroup.length >= 2) {
				orGroups.push([...currentOrGroup]);
			} else if (currentOrGroup.length === 1) {
				// Single term in group should be added as regular term
				terms.push(currentOrGroup[0]);
			}
			currentOrGroup = [];
			inOrGroup = false;
		}
	}
	
	// Add any remaining OR group
	if (inOrGroup && currentOrGroup.length >= 2) {
		orGroups.push(currentOrGroup);
	} else if (inOrGroup && currentOrGroup.length === 1) {
		// Single term should be added as regular term
		terms.push(currentOrGroup[0]);
	}
	
	// Apply field prefix if set
	if (fieldPrefix) {
		filters.field = fieldPrefix;
	}
	
	const query: ParsedQuery = {
		raw: input,
		mode,
		terms,
		phrases,
		excludes,
		orGroups,
		filters,
		regex: regexSpec
	};
	
	return { query, errors };
}

/**
 * Creates a highlight regex from parsed query terms.
 * Combines regular terms and phrases into a single regex for highlighting matches.
 * 
 * @param query Parsed query object
 * @param diacritics Whether to preserve diacritics in matching
 * @returns RegExp for highlighting, or undefined if no highlightable terms
 * 
 * @example
 * const query = parseQuery('hello "world test" cafe', settings);
 * const regex = createQueryHighlightRegex(query, false);
 * // Creates regex to match: hello, world, test, cafe (diacritic-folded)
 */
export function createQueryHighlightRegex(
	query: ParsedQuery, 
	diacritics: boolean = true
): RegExp | undefined {
	const allTerms: string[] = [];
	
	// Add regular terms
	allTerms.push(...query.terms);
	
	// Add OR group terms (flatten all OR groups)
	for (const group of query.orGroups) {
		allTerms.push(...group);
	}
	
	// Add phrase terms (split phrases into individual words for highlighting)
	for (const phrase of query.phrases) {
		const phraseWords = phrase.split(/\s+/).filter(word => word.length > 0);
		allTerms.push(...phraseWords);
	}
	
	// Don't include excludes in highlighting
	
	return createHighlightRegex(allTerms, diacritics);
}

/**
 * Checks if a query string should be treated as a commands query.
 * Based on commands prefix settings and query content.
 * 
 * @param input Query string to check
 * @param settings Plugin settings
 * @returns True if query should be processed in commands mode
 */
function isCommandsQuery(input: string, settings: QueryParserSettings): boolean {
	if (!settings.commands.enableCommandsPrefix) {
		return false;
	}
	
	return input.startsWith(settings.commands.commandsPrefixChar);
}

/**
 * Validates that a ParsedQuery object has valid structure.
 * Useful for testing and debugging.
 * 
 * @param query Query object to validate
 * @returns True if query structure is valid
 */
export function validateParsedQuery(query: ParsedQuery): boolean {
	if (!query || typeof query !== 'object') {
		return false;
	}
	
	// Check required fields
	if (typeof query.raw !== 'string' ||
		!['files', 'commands'].includes(query.mode) ||
		!Array.isArray(query.terms) ||
		!Array.isArray(query.phrases) ||
		!Array.isArray(query.excludes) ||
		!Array.isArray(query.orGroups) ||
		typeof query.filters !== 'object') {
		return false;
	}
	
	// Check OR groups structure
	for (const group of query.orGroups) {
		if (!Array.isArray(group)) {
			return false;
		}
		for (const term of group) {
			if (typeof term !== 'string') {
				return false;
			}
		}
	}
	
	// Check filters structure
	const { filters } = query;
	if (filters.tag && !Array.isArray(filters.tag)) return false;
	if (filters.path && !Array.isArray(filters.path)) return false;
	if (filters.in && !Array.isArray(filters.in)) return false;
	if (filters.field && !['headings', 'symbols'].includes(filters.field)) return false;
	
	// Check regex structure if present
	if (query.regex) {
		if (typeof query.regex.source !== 'string' || 
			typeof query.regex.flags !== 'string') {
			return false;
		}
	}
	
	return true;
}

/**
 * Creates a minimal empty query structure.
 * Useful for initializing search states or handling empty input.
 * 
 * @param mode Query mode to use
 * @returns Empty parsed query
 */
export function createEmptyQuery(mode: QueryMode = 'files'): ParsedQuery {
	return {
		raw: '',
		mode,
		terms: [],
		phrases: [],
		excludes: [],
		orGroups: [],
		filters: {}
	};
}