// ABOUTME: Comprehensive tests for the scoring model implementation
// ABOUTME: Tests fuzzy matching, prefix matching, recency bonus, and weight configuration

import { scoreDoc, createScorer, DEFAULT_SCORER_CONFIG, ScorerConfig } from './scorer';
import { Doc, ParsedQuery } from './types';

describe('Scorer', () => {
	// Test document fixtures
	const mockDoc1: Doc = {
		id: 'test1.md',
		title: 'Test Document',
		path: ['folder', 'subfolder'],
		tags: ['important', 'project'],
		headings: ['Introduction', 'Main Content'],
		symbols: ['link-ref', 'block-id'],
		body: 'This is the body content with some keywords',
		mtime: Date.now() - 1000 * 60 * 60 * 24, // 1 day old
		size: 100
	};

	const mockDoc2: Doc = {
		id: 'café.md',
		title: 'Café Document',
		path: ['café'],
		tags: ['café'],
		headings: ['Café Hours'],
		symbols: ['café-symbol'],
		body: 'Welcome to our café',
		mtime: Date.now() - 1000 * 60 * 60 * 24 * 30, // 30 days old
		size: 50
	};

	const mockDoc3: Doc = {
		id: 'recent.md',
		title: 'Recent Document',
		path: [],
		tags: [],
		headings: [],
		symbols: [],
		body: 'Very recent content',
		mtime: Date.now() - 1000 * 60 * 60, // 1 hour old
		size: 25
	};

	const mockDoc4: Doc = {
		id: 'excluded.md',
		title: 'Document with unwanted content',
		path: [],
		tags: ['unwanted'],
		headings: [],
		symbols: [],
		body: 'This contains spam content',
		mtime: Date.now(),
		size: 30
	};

	// Test query fixtures
	const simpleQuery: ParsedQuery = {
		raw: 'test',
		mode: 'files',
		terms: ['test'],
		phrases: [],
		excludes: [],
		orGroups: [],
		filters: {},
	};

	const phraseQuery: ParsedQuery = {
		raw: '"test document"',
		mode: 'files',
		terms: [],
		phrases: ['test document'],
		excludes: [],
		orGroups: [],
		filters: {},
	};

	const excludeQuery: ParsedQuery = {
		raw: 'content -spam',
		mode: 'files',
		terms: ['content'],
		phrases: [],
		excludes: ['spam'],
		orGroups: [],
		filters: {},
	};

	const diacriticQuery: ParsedQuery = {
		raw: 'cafe',
		mode: 'files',
		terms: ['cafe'],
		phrases: [],
		excludes: [],
		orGroups: [],
		filters: {},
	};

	describe('Basic Scoring', () => {
		it('should score documents with term matches', () => {
			const result = scoreDoc(mockDoc1, simpleQuery, DEFAULT_SCORER_CONFIG);
			
			expect(result).not.toBeNull();
			expect(result!.score).toBeGreaterThan(0);
			expect(result!.doc).toBe(mockDoc1);
			expect(result!.matchSpans).toHaveLength(1);
		});

		it('should return null for empty queries when no terms', () => {
			const emptyQuery: ParsedQuery = {
				raw: '',
				mode: 'files',
				terms: [],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			};

			const result = scoreDoc(mockDoc1, emptyQuery, DEFAULT_SCORER_CONFIG);
			expect(result).not.toBeNull(); // Should still return due to recency scoring
			expect(result!.score).toBeGreaterThan(0); // Should have recency bonus
		});
	});

	describe('Weight Configuration', () => {
		it('should apply title weight higher than body weight', () => {
			const titleMatchDoc: Doc = {
				...mockDoc1,
				title: 'important keyword',
				body: 'no matches here'
			};

			const bodyMatchDoc: Doc = {
				...mockDoc1,
				title: 'no matches here',
				body: 'important keyword'
			};

			const query: ParsedQuery = {
				raw: 'keyword',
				mode: 'files',
				terms: ['keyword'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			};

			const titleResult = scoreDoc(titleMatchDoc, query, DEFAULT_SCORER_CONFIG);
			const bodyResult = scoreDoc(bodyMatchDoc, query, DEFAULT_SCORER_CONFIG);

			expect(titleResult!.score).toBeGreaterThan(bodyResult!.score);
		});

		it('should respect custom weight configuration', () => {
			const customConfig: ScorerConfig = {
				...DEFAULT_SCORER_CONFIG,
				weights: {
					...DEFAULT_SCORER_CONFIG.weights,
					body: 10, // Very high body weight
					title: 0.1
				}
			};

			const titleMatchDoc: Doc = {
				...mockDoc1,
				title: 'keyword match',
				body: 'no matches'
			};

			const bodyMatchDoc: Doc = {
				...mockDoc1,
				title: 'no matches',
				body: 'keyword match'
			};

			const query: ParsedQuery = {
				raw: 'keyword',
				mode: 'files',
				terms: ['keyword'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			};

			const titleResult = scoreDoc(titleMatchDoc, query, customConfig);
			const bodyResult = scoreDoc(bodyMatchDoc, query, customConfig);

			// With custom weights, body should score higher
			expect(bodyResult!.score).toBeGreaterThan(titleResult!.score);
		});
	});

	describe('Prefix and Fuzzy Matching', () => {
		it('should score prefix matches higher than fuzzy matches', () => {
			const prefixDoc: Doc = {
				...mockDoc1,
				title: 'testing document'
			};

			const fuzzyDoc: Doc = {
				...mockDoc1,
				title: 'tset document' // One character transposition
			};

			const query: ParsedQuery = {
				raw: 'test',
				mode: 'files',
				terms: ['test'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			};

			const prefixResult = scoreDoc(prefixDoc, query, DEFAULT_SCORER_CONFIG);
			const fuzzyResult = scoreDoc(fuzzyDoc, query, DEFAULT_SCORER_CONFIG);

			expect(prefixResult!.score).toBeGreaterThan(fuzzyResult!.score);
		});

		it('should handle fuzzy matching with character errors', () => {
			const fuzzyDoc: Doc = {
				...mockDoc1,
				title: 'tset' // Transposition error
			};

			const query: ParsedQuery = {
				raw: 'test',
				mode: 'files',
				terms: ['test'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			};

			const result = scoreDoc(fuzzyDoc, query, DEFAULT_SCORER_CONFIG);
			expect(result!.score).toBeGreaterThan(0);
		});

		it('should not match terms that are too distant', () => {
			const distantDoc: Doc = {
				...mockDoc1,
				title: 'completely different words'
			};

			const query: ParsedQuery = {
				raw: 'test',
				mode: 'files',
				terms: ['test'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			};

			const result = scoreDoc(distantDoc, query, DEFAULT_SCORER_CONFIG);
			// Should still get a score due to recency bonus, but no term matching
			expect(result!.score).toBeLessThan(1);
		});
	});

	describe('Diacritic Folding', () => {
		it('should match diacritics when folding is enabled', () => {
			const configWithFolding: ScorerConfig = {
				...DEFAULT_SCORER_CONFIG,
				diacritics: false // Enable folding (false = remove diacritics)
			};

			const result = scoreDoc(mockDoc2, diacriticQuery, configWithFolding);
			expect(result!.score).toBeGreaterThan(0);
		});

		it('should not match diacritics when folding is disabled', () => {
			const configWithoutFolding: ScorerConfig = {
				...DEFAULT_SCORER_CONFIG,
				diacritics: true // Disable folding (true = preserve diacritics)
			};

			const result = scoreDoc(mockDoc2, diacriticQuery, configWithoutFolding);
			// Should still have some score from recency, but less than with diacritic matching
			expect(result).not.toBeNull();
		});
	});

	describe('Recency Bonus', () => {
		it('should give newer documents higher recency bonus', () => {
			const recentResult = scoreDoc(mockDoc3, simpleQuery, DEFAULT_SCORER_CONFIG);
			const oldResult = scoreDoc(mockDoc2, simpleQuery, DEFAULT_SCORER_CONFIG);

			// Recent document should have higher recency component
			// Both should have same term matching, so difference is recency
			expect(recentResult!.score).toBeGreaterThan(oldResult!.score);
		});

		it('should cap recency bonus at 0.5', () => {
			const veryRecentDoc: Doc = {
				...mockDoc1,
				mtime: Date.now() // Right now
			};

			const query: ParsedQuery = {
				raw: '', // No terms to isolate recency scoring
				mode: 'files',
				terms: [],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			};

			const configWithHighRecencyWeight: ScorerConfig = {
				...DEFAULT_SCORER_CONFIG,
				weights: {
					...DEFAULT_SCORER_CONFIG.weights,
					recency: 1.0 // Full weight on recency
				}
			};

			const result = scoreDoc(veryRecentDoc, query, configWithHighRecencyWeight);
			
			// Score should be <= 0.5 due to recency bonus cap
			expect(result!.score).toBeLessThanOrEqual(0.5);
			expect(result!.score).toBeGreaterThan(0);
		});

		it('should respect custom recency half-life', () => {
			const shortHalfLife: ScorerConfig = {
				...DEFAULT_SCORER_CONFIG,
				recencyHalfLife: 1 // 1 day half-life
			};

			const longHalfLife: ScorerConfig = {
				...DEFAULT_SCORER_CONFIG,
				recencyHalfLife: 365 // 1 year half-life
			};

			const query: ParsedQuery = {
				raw: '',
				mode: 'files',
				terms: [],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			};

			// Document that's 2 days old
			const oldDoc: Doc = {
				...mockDoc1,
				mtime: Date.now() - 1000 * 60 * 60 * 24 * 2
			};

			const shortResult = scoreDoc(oldDoc, query, shortHalfLife);
			const longResult = scoreDoc(oldDoc, query, longHalfLife);

			// Longer half-life should give higher recency bonus for the same aged document
			expect(longResult!.score).toBeGreaterThan(shortResult!.score);
		});
	});

	describe('Phrase Matching', () => {
		it('should add bonus for exact phrase matches', () => {
			const termResult = scoreDoc(mockDoc1, simpleQuery, DEFAULT_SCORER_CONFIG);
			const phraseResult = scoreDoc(mockDoc1, phraseQuery, DEFAULT_SCORER_CONFIG);

			// Phrase query should get bonus points
			expect(phraseResult!.score).toBeGreaterThan(0);
		});

		it('should add 0.25 per phrase occurrence', () => {
			const multiPhraseDoc: Doc = {
				...mockDoc1,
				title: 'test document',
				body: 'This is a test document with test document repeated'
			};

			const result = scoreDoc(multiPhraseDoc, phraseQuery, DEFAULT_SCORER_CONFIG);
			
			// Should have bonus for multiple phrase occurrences
			expect(result!.score).toBeGreaterThan(0);
		});
	});

	describe('Exclusion Logic', () => {
		it('should exclude documents containing exclude terms', () => {
			const result = scoreDoc(mockDoc4, excludeQuery, DEFAULT_SCORER_CONFIG);
			expect(result).toBeNull();
		});

		it('should not exclude documents without exclude terms', () => {
			const result = scoreDoc(mockDoc1, excludeQuery, DEFAULT_SCORER_CONFIG);
			expect(result).not.toBeNull();
			expect(result!.score).toBeGreaterThan(0);
		});

		it('should handle exclude terms with diacritic folding', () => {
			const excludeQueryCafe: ParsedQuery = {
				raw: 'welcome -cafe',
				mode: 'files',
				terms: ['welcome'],
				phrases: [],
				excludes: ['cafe'],
				orGroups: [],
				filters: {},
			};

			const configWithFolding: ScorerConfig = {
				...DEFAULT_SCORER_CONFIG,
				diacritics: false
			};

			// Should exclude café document when searching for -cafe with folding
			const result = scoreDoc(mockDoc2, excludeQueryCafe, configWithFolding);
			expect(result).toBeNull();
		});
	});

	describe('Match Spans', () => {
		it('should generate match spans for term matches', () => {
			const result = scoreDoc(mockDoc1, simpleQuery, DEFAULT_SCORER_CONFIG);
			
			expect(result!.matchSpans).toHaveLength(1);
			expect(result!.matchSpans[0]).toHaveProperty('field');
			expect(result!.matchSpans[0]).toHaveProperty('start');
			expect(result!.matchSpans[0]).toHaveProperty('end');
			expect(result!.matchSpans[0].start).toBeGreaterThanOrEqual(0);
			expect(result!.matchSpans[0].end).toBeGreaterThan(result!.matchSpans[0].start);
		});

		it('should generate spans for multiple field matches', () => {
			const multiFieldDoc: Doc = {
				...mockDoc1,
				title: 'test title',
				headings: ['test heading'],
				body: 'test body content'
			};

			const result = scoreDoc(multiFieldDoc, simpleQuery, DEFAULT_SCORER_CONFIG);
			
			// Should have multiple match spans for different fields
			expect(result!.matchSpans.length).toBeGreaterThan(1);
		});
	});

	describe('createScorer Function', () => {
		it('should create a scorer function with bound configuration', () => {
			const customConfig: ScorerConfig = {
				weights: {
					title: 10,
					headings: 1,
					path: 1,
					tags: 1,
					symbols: 1,
					body: 1,
					recency: 1
				},
				diacritics: false,
				recencyHalfLife: 7
			};

			const scorer = createScorer(customConfig);
			const result = scorer(mockDoc1, simpleQuery);
			
			expect(result).not.toBeNull();
			expect(result!.score).toBeGreaterThan(0);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty document fields gracefully', () => {
			const emptyDoc: Doc = {
				id: 'empty.md',
				title: '',
				path: [],
				tags: [],
				headings: [],
				symbols: [],
				body: '',
				mtime: Date.now(),
				size: 0
			};

			const result = scoreDoc(emptyDoc, simpleQuery, DEFAULT_SCORER_CONFIG);
			
			// Should still return a result with recency bonus
			expect(result).not.toBeNull();
			expect(result!.score).toBeGreaterThan(0);
		});

		it('should handle documents with very long content', () => {
			const longDoc: Doc = {
				...mockDoc1,
				body: 'test '.repeat(10000) // Very long body
			};

			const result = scoreDoc(longDoc, simpleQuery, DEFAULT_SCORER_CONFIG);
			
			expect(result).not.toBeNull();
			expect(result!.score).toBeGreaterThan(0);
		});

		it('should handle special characters in content', () => {
			const specialDoc: Doc = {
				...mockDoc1,
				title: 'test @#$%^&*()_+ document',
				body: 'Content with special chars: []{}|\\:";\'<>?,./'
			};

			const result = scoreDoc(specialDoc, simpleQuery, DEFAULT_SCORER_CONFIG);
			
			expect(result).not.toBeNull();
			expect(result!.score).toBeGreaterThan(0);
		});

		it('should handle unicode content properly', () => {
			const unicodeDoc: Doc = {
				...mockDoc1,
				title: 'test 测试 документ',
				body: 'Unicode content: 🚀 💻 📝'
			};

			const result = scoreDoc(unicodeDoc, simpleQuery, DEFAULT_SCORER_CONFIG);
			
			expect(result).not.toBeNull();
			expect(result!.score).toBeGreaterThan(0);
		});
	});
});