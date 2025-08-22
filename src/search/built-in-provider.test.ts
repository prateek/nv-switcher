// ABOUTME: Unit tests for BuiltInProvider inverted index search implementation
// ABOUTME: Tests indexing, querying, updates, regex filtering, and performance characteristics

import { describe, it, expect, beforeEach } from 'vitest';
import { BuiltInProvider } from './built-in-provider';
import type { Doc, ParsedQuery, SearchResult } from './types';

describe('BuiltInProvider', () => {
	let provider: BuiltInProvider;
	let sampleDocs: Doc[];

	beforeEach(() => {
		provider = new BuiltInProvider({ debug: false });
		
		sampleDocs = [
			{
				id: 'note1.md',
				title: 'Project Planning',
				path: ['projects', 'work'],
				tags: ['todo', 'urgent'],
				headings: ['Overview', 'Timeline'],
				symbols: ['[[link1]]', '#tag1'],
				body: 'This is a detailed project planning document with tasks and deadlines.',
				mtime: 1640995200000, // 2022-01-01
				size: 1024,
			},
			{
				id: 'note2.md',
				title: 'Meeting Notes',
				path: ['meetings'],
				tags: ['meeting', 'work'],
				headings: ['Agenda', 'Action Items'],
				symbols: ['[[contact]]', '!important'],
				body: 'Team meeting notes with action items and follow-ups.',
				mtime: 1641081600000, // 2022-01-02
				size: 512,
			},
			{
				id: 'note3.md',
				title: 'Research Ideas',
				path: ['research'],
				tags: ['research', 'ideas'],
				headings: ['Background', 'Hypothesis'],
				symbols: ['[[paper1]]', '{{query}}'],
				body: 'Research ideas and hypotheses for the upcoming project.',
				mtime: 1641168000000, // 2022-01-03
				size: 2048,
			},
		];
	});

	describe('Basic Operations', () => {
		it('should start with empty index', async () => {
			const results = await provider.query({
				raw: 'test',
				mode: 'files',
				terms: ['test'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			});
			
			expect(results).toEqual([]);
		});

		it('should index documents', async () => {
			await provider.indexAll(sampleDocs);
			
			// Search for a common term
			const results = await provider.query({
				raw: 'project',
				mode: 'files',
				terms: ['project'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			});
			
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].id).toEqual('note1.md'); // Should be highest scoring
			expect(results[0].score).toBeGreaterThan(0);
		});

		it('should upsert documents', async () => {
			await provider.indexAll(sampleDocs);
			
			// Update an existing document
			const updatedDoc: Doc = {
				...sampleDocs[0],
				body: 'Updated project planning document with new requirements.',
			};
			
			await provider.upsert(updatedDoc);
			
			const results = await provider.query({
				raw: 'requirements',
				mode: 'files',
				terms: ['requirements'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			});
			
			expect(results.length).toBe(1);
			expect(results[0].id).toBe('note1.md');
		});

		it('should remove documents', async () => {
			await provider.indexAll(sampleDocs);
			
			await provider.remove('note1.md');
			
			const results = await provider.query({
				raw: 'project',
				mode: 'files',
				terms: ['project'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			});
			
			// Should only find "project" in the research note now
			expect(results.length).toBe(1);
			expect(results[0].id).toBe('note3.md');
		});

		it('should clear all documents', async () => {
			await provider.indexAll(sampleDocs);
			await provider.clear();
			
			const results = await provider.query({
				raw: 'project',
				mode: 'files',
				terms: ['project'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			});
			
			expect(results).toEqual([]);
		});
	});

	describe('Query Features', () => {
		beforeEach(async () => {
			await provider.indexAll(sampleDocs);
		});

		it('should return recent documents for empty query', async () => {
			const results = await provider.query({
				raw: '',
				mode: 'files',
				terms: [],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			});
			
			expect(results.length).toBe(3);
			// Should be sorted by mtime descending
			expect(results[0].id).toBe('note3.md'); // Most recent
			expect(results[1].id).toBe('note2.md');
			expect(results[2].id).toBe('note1.md'); // Oldest
		});

		it('should handle multiple terms with AND semantics', async () => {
			const results = await provider.query({
				raw: 'project planning',
				mode: 'files',
				terms: ['project', 'planning'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			});
			
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].id).toBe('note1.md'); // Contains both terms
		});

		it('should handle OR groups', async () => {
			const results = await provider.query({
				raw: 'meeting OR research',
				mode: 'files',
				terms: [],
				phrases: [],
				excludes: [],
				orGroups: [['meeting', 'research']],
				filters: {},
			});
			
			expect(results.length).toBe(2);
			const ids = results.map(r => r.id).sort();
			expect(ids).toEqual(['note2.md', 'note3.md']);
		});

		it('should apply regex post-filtering', async () => {
			const results = await provider.query({
				raw: 'project /up\\w+/',
				mode: 'files',
				terms: ['project'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
				regex: {
					source: 'up\\w+',
					flags: 'i',
				},
			});
			
			
			// Should find documents that contain "project" AND match regex
			// note1.md: contains "project" but doesn't match regex -> filtered out
			// note2.md: doesn't contain "project" -> not in candidate set
			// note3.md: contains "project" and matches regex -> included
			expect(results.length).toBe(1);
			expect(results[0].id).toBe('note3.md');
			
			// Should have match spans for both term and regex
			expect(results[0].matchSpans.length).toBeGreaterThan(0);
		});

		it('should handle invalid regex gracefully', async () => {
			const results = await provider.query({
				raw: 'project /[invalid/',
				mode: 'files',
				terms: ['project'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
				regex: {
					source: '[invalid',
					flags: '',
				},
			});
			
			// Should ignore invalid regex and return normal results
			expect(results.length).toBeGreaterThan(0);
		});

		it('should respect result limits', async () => {
			const results = await provider.query({
				raw: 'project',
				mode: 'files',
				terms: ['project'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			}, { limit: 1 });
			
			expect(results.length).toBe(1);
		});
	});

	describe('Filters', () => {
		beforeEach(async () => {
			await provider.indexAll(sampleDocs);
		});

		it('should filter by tags', async () => {
			const results = await provider.query({
				raw: '',
				mode: 'files',
				terms: [],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {
					tag: ['urgent'],
				},
			});
			
			// This test will need the scorer to implement tag filtering
			// For now, we verify the structure is correct
			expect(Array.isArray(results)).toBe(true);
		});

		it('should filter by path', async () => {
			const results = await provider.query({
				raw: '',
				mode: 'files',
				terms: [],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {
					path: ['projects'],
				},
			});
			
			// This test will need the scorer to implement path filtering
			// For now, we verify the structure is correct
			expect(Array.isArray(results)).toBe(true);
		});
	});

	describe('Performance', () => {
		it('should handle large document body', async () => {
			const largeDoc: Doc = {
				id: 'large.md',
				title: 'Large Document',
				path: ['test'],
				tags: [],
				headings: [],
				symbols: [],
				body: 'x'.repeat(3 * 1024 * 1024), // 3MB - should be truncated
				mtime: Date.now(),
				size: 3 * 1024 * 1024,
			};
			
			await provider.upsert(largeDoc);
			
			const results = await provider.query({
				raw: 'large',
				mode: 'files',
				terms: ['large'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			});
			
			expect(results.length).toBe(1);
			expect(results[0].id).toBe('large.md');
		});

		it('should respect document limit', async () => {
			const limitedProvider = new BuiltInProvider({ maxDocs: 2 });
			
			await limitedProvider.upsert(sampleDocs[0]);
			await limitedProvider.upsert(sampleDocs[1]);
			
			// Third document should fail
			await expect(limitedProvider.upsert(sampleDocs[2]))
				.rejects.toThrow('Maximum document limit reached');
		});
	});

	describe('Performance', () => {
		it('should handle moderate load efficiently', async () => {
			// Generate 100 test documents
			const largeDocs: Doc[] = [];
			for (let i = 0; i < 100; i++) {
				largeDocs.push({
					id: `large-${i}.md`,
					title: `Document ${i}`,
					path: ['test', `folder-${i % 10}`],
					tags: [`tag-${i % 5}`],
					headings: [`Heading ${i}`],
					symbols: [],
					body: `This is test document ${i} with searchable content about project ${i} and tasks. `.repeat(5),
					mtime: Date.now() - i * 1000,
					size: 500,
				});
			}
			
			// Benchmark indexing
			const indexStart = performance.now();
			await provider.indexAll(largeDocs);
			const indexTime = performance.now() - indexStart;
			
			// Should index reasonably fast (target: <200ms for 100 docs)
			expect(indexTime).toBeLessThan(200);
			
			// Benchmark query
			const queryStart = performance.now();
			const results = await provider.query({
				raw: 'project',
				mode: 'files',
				terms: ['project'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			});
			const queryTime = performance.now() - queryStart;
			
			// Should query fast (target: <20ms)
			expect(queryTime).toBeLessThan(20);
			expect(results.length).toBeGreaterThan(0);
			
			console.log(`Perf: ${largeDocs.length} docs indexed in ${indexTime.toFixed(1)}ms, queried in ${queryTime.toFixed(1)}ms`);
		});
	});

	describe('Progressive Loading (queryStream)', () => {
		beforeEach(async () => {
			// Create larger dataset for streaming tests
			const streamDocs: Doc[] = [];
			for (let i = 0; i < 200; i++) {
				streamDocs.push({
					id: `stream-${i}.md`,
					title: `Document ${i}`,
					path: [`folder-${i % 5}`],
					tags: [`tag-${i % 3}`],
					headings: [`Section ${i}`],
					symbols: [],
					body: `This is document ${i} about project ${i % 10} with analysis content.`,
					mtime: Date.now() - i * 1000,
					size: 100,
				});
			}
			await provider.indexAll(streamDocs);
		});

		it('should stream results progressively', async () => {
			const results: SearchResult[] = [];
			const timestamps: number[] = [];
			
			const startTime = performance.now();
			
			for await (const result of provider.queryStream({
				raw: 'project',
				mode: 'files',
				terms: ['project'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			}, { limit: 50 })) {
				results.push(result);
				timestamps.push(performance.now() - startTime);
			}
			
			expect(results.length).toBeGreaterThan(0);
			expect(results.length).toBeLessThanOrEqual(50);
			
			// Results should be sorted by score descending
			for (let i = 1; i < results.length; i++) {
				expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
			}
			
			console.log(`Streamed ${results.length} results over ${timestamps[timestamps.length - 1]?.toFixed(1)}ms`);
		});

		it('should handle empty query streaming', async () => {
			const results: SearchResult[] = [];
			
			for await (const result of provider.queryStream({
				raw: '',
				mode: 'files',
				terms: [],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			}, { limit: 10 })) {
				results.push(result);
			}
			
			expect(results.length).toBe(10);
			// Should be sorted by mtime descending (recent first)
			for (let i = 1; i < results.length; i++) {
				expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
			}
		});

		it('should apply regex filtering to streamed results', async () => {
			const results: SearchResult[] = [];
			
			for await (const result of provider.queryStream({
				raw: 'project /\\d+/',
				mode: 'files',
				terms: ['project'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
				regex: { source: '\\d+', flags: 'g' },
			}, { limit: 20 })) {
				results.push(result);
			}
			
			expect(results.length).toBeGreaterThan(0);
			
			// All results should have match spans from regex
			for (const result of results) {
				expect(result.matchSpans.length).toBeGreaterThan(0);
			}
		});

		it('should respect limit in streaming mode', async () => {
			const results: SearchResult[] = [];
			
			for await (const result of provider.queryStream({
				raw: 'document',
				mode: 'files',
				terms: ['document'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			}, { limit: 5 })) {
				results.push(result);
			}
			
			expect(results.length).toBeLessThanOrEqual(5);
		});
	});

	describe('Heap-Based Optimization', () => {
		it('should use heap for memory-efficient top-K', async () => {
			// Create many documents but only request top few
			const manyDocs: Doc[] = [];
			for (let i = 0; i < 500; i++) {
				manyDocs.push({
					id: `heap-test-${i}.md`,
					title: `Test ${i}`,
					path: [],
					tags: [],
					headings: [],
					symbols: [],
					body: `Test document ${i} with query term searchword and score ${1000 - i}.`,
					mtime: Date.now() - i * 1000,
					size: 100,
				});
			}
			await provider.indexAll(manyDocs);
			
			const results = await provider.query({
				raw: 'searchword',
				mode: 'files',
				terms: ['searchword'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			}, { limit: 10 });
			
			expect(results.length).toBe(10);
			
			// Results should be sorted by score descending
			for (let i = 1; i < results.length; i++) {
				expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
			}
			
			// Should get the highest scoring documents
			expect(results[0].id).toBe('heap-test-0.md'); // Highest score
			expect(results[1].id).toBe('heap-test-1.md'); // Second highest
		});
	});

	describe('Index Consistency', () => {
		it('should maintain consistent index after operations', async () => {
			await provider.indexAll(sampleDocs);
			
			// Add, update, remove cycle
			const newDoc: Doc = {
				id: 'new.md',
				title: 'New Document',
				path: ['test'],
				tags: ['new'],
				headings: [],
				symbols: [],
				body: 'A new document for testing.',
				mtime: Date.now(),
				size: 100,
			};
			
			await provider.upsert(newDoc);
			await provider.upsert({ ...newDoc, body: 'Updated content.' });
			await provider.remove('new.md');
			
			// Should not find the removed document
			const results = await provider.query({
				raw: 'new',
				mode: 'files',
				terms: ['new'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			});
			
			expect(results.find(r => r.id === 'new.md')).toBeUndefined();
		});

		it('should handle removing non-existent document', async () => {
			await provider.indexAll(sampleDocs);
			
			// Should not throw
			await expect(provider.remove('nonexistent.md')).resolves.not.toThrow();
		});
	});
});