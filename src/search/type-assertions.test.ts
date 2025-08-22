// ABOUTME: Compile-time type assertions for search system types
// ABOUTME: Verifies type assignability and interface contracts at compile time

import { describe, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import type { 
	Doc, 
	ParsedQuery, 
	MatchSpan, 
	SearchResult,
	QueryMode,
	QueryFilters,
	SearchableField,
	FieldWeights,
	QueryOptions
} from './types';
import type { 
	SearchProvider,
	ProviderConfig,
	BuiltInProviderConfig,
	ExternalProviderConfig
} from './provider';

describe.skip('Type Assertions', () => {
	it('should validate type contracts at compile time', () => {
		// Test Doc type structure
		
		const testDoc: Doc = {
			id: 'test.md',
			title: 'Test Document',
			path: ['folder', 'subfolder'],
			tags: ['tag1', 'tag2'],
			headings: ['# Heading 1', '## Heading 2'],
			symbols: ['[[link]]', '^block-ref'],
			body: 'document content',
			mtime: Date.now(),
			size: 1024
		};

		expectTypeOf(testDoc).toMatchTypeOf<Doc>();
		expectTypeOf(testDoc.id).toBeString();
		expectTypeOf(testDoc.path).toBeArray();
		expectTypeOf(testDoc.mtime).toBeNumber();

// Test ParsedQuery type structure

		const testQuery: ParsedQuery = {
	raw: 'test query #tag',
	mode: 'files',
	terms: ['test', 'query'],
	phrases: ['exact phrase'],
	excludes: ['exclude'],
	orGroups: [['term1', 'term2']],
	filters: {
		tag: ['tag'],
		path: ['folder'],
		in: ['subfolder'],
		field: 'headings'
	},
	regex: {
		source: 'pattern',
		flags: 'i'
	}
};

		expectTypeOf(testQuery).toMatchTypeOf<ParsedQuery>();
		expectTypeOf(testQuery.mode).toEqualTypeOf<QueryMode>();
		expectTypeOf(testQuery.filters).toMatchTypeOf<QueryFilters>();

// Test MatchSpan type structure

		const testSpan: MatchSpan = {
	field: 'body',
	start: 10,
	end: 20
};

		expectTypeOf(testSpan).toMatchTypeOf<MatchSpan>();
		expectTypeOf(testSpan.field).toEqualTypeOf<keyof Doc>();

// Test SearchResult type structure

		const testResult: SearchResult = {
	id: 'test.md',
	score: 0.95,
	matchSpans: [testSpan]
};

		expectTypeOf(testResult).toMatchTypeOf<SearchResult>();
		expectTypeOf(testResult.matchSpans).toBeArray();

// Test SearchProvider interface

		const testProvider: SearchProvider = {
	async indexAll(docs: Doc[]): Promise<void> {
		// Implementation
	},
	async upsert(doc: Doc): Promise<void> {
		// Implementation
	},
	async remove(id: string): Promise<void> {
		// Implementation
	},
	async query(q: ParsedQuery, opts?: QueryOptions): Promise<SearchResult[]> {
		return [];
	},
	async clear(): Promise<void> {
		// Implementation
	}
};

		expectTypeOf(testProvider).toMatchTypeOf<SearchProvider>();
		expectTypeOf(testProvider.query).toBeFunction();
		expectTypeOf(testProvider.query).returns.toEqualTypeOf<Promise<SearchResult[]>>();

// Test ProviderConfig discriminated union
		const builtInConfig: BuiltInProviderConfig = {
			kind: 'builtIn',
	options: {
		maxDocs: 10000,
		debug: true
	}
};

const externalConfig: ExternalProviderConfig = {
			kind: 'external',
	name: 'omnisearch',
	options: {
		customOption: 'value'
	}
};

		expectTypeOf(builtInConfig).toMatchTypeOf<ProviderConfig>();
		expectTypeOf(externalConfig).toMatchTypeOf<ProviderConfig>();

// Test discriminated union narrowing
if (builtInConfig.kind === 'builtIn') {
			expectTypeOf(builtInConfig).toEqualTypeOf<BuiltInProviderConfig>();
}

if (externalConfig.kind === 'external') {
			expectTypeOf(externalConfig).toEqualTypeOf<ExternalProviderConfig>();
			expectTypeOf(externalConfig.name).toBeString();
}

// Test utility types
const searchableField: SearchableField = 'title';
		expectTypeOf(searchableField).toEqualTypeOf<SearchableField>();

const fieldWeights: FieldWeights = {
	title: 4.0,
	headings: 2.0,
	path: 1.5,
	tags: 1.5,
	symbols: 1.5,
	body: 1.0,
	recency: 0.5
};
		expectTypeOf(fieldWeights).toMatchTypeOf<FieldWeights>();

const queryOptions: QueryOptions = {
	limit: 100,
	signal: new AbortController().signal
};
		expectTypeOf(queryOptions).toMatchTypeOf<QueryOptions>();

// Test optional fields behavior
const minimalQuery: ParsedQuery = {
	raw: '',
	mode: 'files',
	terms: [],
	phrases: [],
	excludes: [],
	orGroups: [],
	filters: {}
	// regex is optional and can be omitted
};
		expectTypeOf(minimalQuery).toMatchTypeOf<ParsedQuery>();

// Test that regex field is properly optional
const queryWithoutRegex: ParsedQuery = {
	...minimalQuery,
	regex: undefined
};
		expectTypeOf(queryWithoutRegex).toMatchTypeOf<ParsedQuery>();

		// Export a dummy value to make this a module
		const typeAssertionsPassed = true;
				expectTypeOf(typeAssertionsPassed).toBeBoolean();
	});
});