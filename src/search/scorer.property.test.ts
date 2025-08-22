// ABOUTME: Property-based tests for scorer with monotonicity and weighting invariants
// ABOUTME: Validates scoring behavior under various document and query combinations

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createScorer, DEFAULT_SCORER_CONFIG } from './scorer';
import type { Doc, ParsedQuery } from './types';

describe.skip('Scorer Property-Based Tests', () => {
	describe('Score Invariants', () => {
		it('should never return negative scores', () => {
			fc.assert(fc.property(
				fc.record({
					id: fc.string(),
					title: fc.string(),
					path: fc.array(fc.string(), { maxLength: 5 }),
					tags: fc.array(fc.string(), { maxLength: 5 }),
					headings: fc.array(fc.string(), { maxLength: 5 }),
					symbols: fc.array(fc.string(), { maxLength: 5 }),
					body: fc.string({ maxLength: 1000 }),
					mtime: fc.integer({ min: 0, max: Date.now() }),
					size: fc.integer({ min: 0, max: 100000 })
				}),
				fc.record({
					raw: fc.string(),
					mode: fc.constantFrom('files', 'commands'),
					terms: fc.array(fc.string(), { maxLength: 5 }),
					phrases: fc.array(fc.string(), { maxLength: 3 }),
					excludes: fc.array(fc.string(), { maxLength: 3 }),
					orGroups: fc.array(fc.array(fc.string(), { maxLength: 3 }), { maxLength: 2 }),
					filters: fc.constant({})
				}),
				(doc: Doc, query: ParsedQuery) => {
					const scorer = createScorer(DEFAULT_SCORER_CONFIG);
					const result = scorer(doc, query);
					
					if (result) {
						expect(result.score).toBeGreaterThanOrEqual(0);
						expect(Number.isFinite(result.score)).toBe(true); // Score should be a finite number
						expect(Array.isArray(result.matchSpans)).toBe(true);
					}
				}
			), { numRuns: 500 });
		});

		it('should return higher scores for better matches', () => {
			fc.assert(fc.property(
				fc.string().filter(s => s.length > 2),
				fc.string({ maxLength: 500 }),
				(term, bodyText) => {
					// Create two docs: one with exact match, one without
					const exactDoc: Doc = {
						id: 'exact',
						title: term,
						path: [],
						tags: [],
						headings: [],
						symbols: [],
						body: bodyText,
						mtime: Date.now(),
						size: 100
					};

					const noMatchDoc: Doc = {
						id: 'nomatch',
						title: 'unrelated',
						path: [],
						tags: [],
						headings: [],
						symbols: [],
						body: bodyText,
						mtime: Date.now(),
						size: 100
					};

					const query: ParsedQuery = {
						raw: term,
						mode: 'files',
						terms: [term],
						phrases: [],
						excludes: [],
						orGroups: [],
						filters: {}
					};

					const scorer = createScorer(DEFAULT_SCORER_CONFIG);
					const exactScore = scorer(exactDoc, query);
					const noMatchScore = scorer(noMatchDoc, query);

					// Exact title match should score higher than no match
					if (exactScore && noMatchScore) {
						expect(exactScore.score).toBeGreaterThan(noMatchScore.score);
					} else if (exactScore && !noMatchScore) {
						expect(exactScore.score).toBeGreaterThan(0);
					}
				}
			), { numRuns: 200 });
		});

		it('should respect field weights consistently', () => {
			fc.assert(fc.property(
				fc.string().filter(s => s.length > 2),
				(term) => {
					const titleDoc: Doc = {
						id: 'title',
						title: term,
						path: [],
						tags: [],
						headings: [],
						symbols: [],
						body: 'unrelated content',
						mtime: Date.now(),
						size: 100
					};

					const bodyDoc: Doc = {
						id: 'body',
						title: 'unrelated',
						path: [],
						tags: [],
						headings: [],
						symbols: [],
						body: term,
						mtime: Date.now(),
						size: 100
					};

					const query: ParsedQuery = {
						raw: term,
						mode: 'files',
						terms: [term],
						phrases: [],
						excludes: [],
						orGroups: [],
						filters: {}
					};

					const scorer = createScorer(DEFAULT_SCORER_CONFIG);
					const titleScore = scorer(titleDoc, query);
					const bodyScore = scorer(bodyDoc, query);

					// Title matches should typically score higher than body matches
					if (titleScore && bodyScore) {
						expect(titleScore.score).toBeGreaterThanOrEqual(bodyScore.score);
					}
				}
			), { numRuns: 200 });
		});

		it('should handle recency correctly', () => {
			fc.assert(fc.property(
				fc.string().filter(s => s.length > 2),
				fc.integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }), // Up to 1 year ago
				(term, ageMs) => {
					const now = Date.now();
					
					const recentDoc: Doc = {
						id: 'recent',
						title: term,
						path: [],
						tags: [],
						headings: [],
						symbols: [],
						body: '',
						mtime: now,
						size: 100
					};

					const oldDoc: Doc = {
						id: 'old',
						title: term,
						path: [],
						tags: [],
						headings: [],
						symbols: [],
						body: '',
						mtime: now - ageMs,
						size: 100
					};

					const query: ParsedQuery = {
						raw: term,
						mode: 'files',
						terms: [term],
						phrases: [],
						excludes: [],
						orGroups: [],
						filters: {}
					};

					const scorer = createScorer(DEFAULT_SCORER_CONFIG);
					const recentScore = scorer(recentDoc, query);
					const oldScore = scorer(oldDoc, query);

					// Recent docs should score at least as high as older ones
					if (recentScore && oldScore) {
						expect(recentScore.score).toBeGreaterThanOrEqual(oldScore.score);
					}
				}
			), { numRuns: 200 });
		});
	});

	describe('Exclusion Invariants', () => {
		it('should exclude documents containing excluded terms', () => {
			fc.assert(fc.property(
				fc.string().filter(s => s.length > 2),
				fc.string().filter(s => s.length > 2),
				(searchTerm, excludeTerm) => {
					const docWithExcluded: Doc = {
						id: 'excluded',
						title: `${searchTerm} ${excludeTerm}`,
						path: [],
						tags: [],
						headings: [],
						symbols: [],
						body: '',
						mtime: Date.now(),
						size: 100
					};

					const query: ParsedQuery = {
						raw: `${searchTerm} -${excludeTerm}`,
						mode: 'files',
						terms: [searchTerm],
						phrases: [],
						excludes: [excludeTerm],
						orGroups: [],
						filters: {}
					};

					const scorer = createScorer(DEFAULT_SCORER_CONFIG);
					const result = scorer(docWithExcluded, query);
					
					// Document containing excluded term should not be scored
					expect(result).toBeNull();
				}
			), { numRuns: 200 });
		});
	});

	describe('Performance Invariants', () => {
		it('should complete scoring within reasonable time', () => {
			fc.assert(fc.property(
				fc.record({
					id: fc.string(),
					title: fc.string({ maxLength: 200 }),
					path: fc.array(fc.string(), { maxLength: 10 }),
					tags: fc.array(fc.string(), { maxLength: 20 }),
					headings: fc.array(fc.string(), { maxLength: 50 }),
					symbols: fc.array(fc.string(), { maxLength: 100 }),
					body: fc.string({ maxLength: 10000 }),
					mtime: fc.integer({ min: 0, max: Date.now() }),
					size: fc.integer({ min: 0, max: 100000 })
				}),
				fc.record({
					raw: fc.string(),
					mode: fc.constantFrom('files'),
					terms: fc.array(fc.string(), { maxLength: 10 }),
					phrases: fc.array(fc.string(), { maxLength: 5 }),
					excludes: fc.array(fc.string(), { maxLength: 5 }),
					orGroups: fc.array(fc.array(fc.string(), { maxLength: 3 }), { maxLength: 3 }),
					filters: fc.constant({})
				}),
				(doc: Doc, query: ParsedQuery) => {
					const start = performance.now();
					const scorer = createScorer(DEFAULT_SCORER_CONFIG);
					const result = scorer(doc, query);
					const duration = performance.now() - start;
					
					// Should complete within 10ms for individual document scoring
					expect(duration).toBeLessThan(10);
				}
			), { numRuns: 100 });
		});
	});
});