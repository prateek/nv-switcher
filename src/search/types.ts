// ABOUTME: Core type definitions for the nv-switcher search system
// ABOUTME: Defines Doc, ParsedQuery, SearchResult and related types for provider contract

/**
 * Represents a searchable document extracted from an Obsidian file
 */
export interface Doc {
	/** Unique identifier for the document (typically the file path) */
	id: string;
	
	/** The title/basename of the document without extension */
	title: string;
	
	/** Path components (folder names) from vault root to the document */
	path: string[];
	
	/** All tags associated with the document (from frontmatter and inline) */
	tags: string[];
	
	/** All headings extracted from the document */
	headings: string[];
	
	/** Symbols including links, block refs, and code block labels */
	symbols: string[];
	
	/** The full normalized body text of the document */
	body: string;
	
	/** Last modified time in milliseconds since epoch */
	mtime: number;
	
	/** File size in bytes */
	size: number;
}

/**
 * Query execution mode
 */
export type QueryMode = 'files' | 'commands';

/**
 * Field-specific search filters
 */
export interface QueryFilters {
	/** Filter by tags (e.g., ["todo", "project"]) */
	tag?: string[];
	
	/** Filter by path components (e.g., ["projects", "work"]) */
	path?: string[];
	
	/** Filter to documents in specific folder(s) */
	in?: string[];
	
	/** Restrict search to specific field(s) */
	field?: 'headings' | 'symbols';
}

/**
 * Parsed and structured search query
 */
export interface ParsedQuery {
	/** The original raw query string as typed by the user */
	raw: string;
	
	/** Whether searching for files or commands */
	mode: QueryMode;
	
	/** Individual search terms (fuzzy matched by default) */
	terms: string[];
	
	/** Exact phrase matches (quoted in input) */
	phrases: string[];
	
	/** Terms to exclude from results (prefixed with -) */
	excludes: string[];
	
	/** Groups of OR'd terms (terms within group are OR'd, groups are AND'd) */
	orGroups: string[][];
	
	/** Field and metadata filters */
	filters: QueryFilters;
	
	/** Optional regex pattern for post-filtering */
	regex?: {
		/** The regex pattern source */
		source: string;
		/** Regex flags (e.g., "i" for case-insensitive) */
		flags: string;
	};
}

/**
 * Represents a match location within a document field
 */
export interface MatchSpan {
	/** The document field containing the match */
	field: keyof Doc;
	
	/** Starting character position of the match within the field */
	start: number;
	
	/** Ending character position (exclusive) of the match within the field */
	end: number;
}

/**
 * Search result for a single document
 */
export interface SearchResult {
	/** Document identifier matching Doc.id */
	id: string;
	
	/** Relevance score (higher is more relevant) */
	score: number;
	
	/** Locations of query matches within the document */
	matchSpans: MatchSpan[];
}

/**
 * Searchable document fields that can contain text matches
 */
export type SearchableField = Extract<keyof Doc, 'title' | 'path' | 'tags' | 'headings' | 'symbols' | 'body'>;

/**
 * Field weight configuration for scoring
 */
export type FieldWeights = Record<SearchableField | 'recency', number>;

/**
 * Options for search query execution
 */
export interface QueryOptions {
	/** Maximum number of results to return */
	limit?: number;
	
	/** AbortSignal for cancelling long-running queries */
	signal?: AbortSignal;
}