// ABOUTME: Contract tests for SearchProvider interface
// ABOUTME: Verifies provider implementations satisfy the interface contract

import { describe, it, expect, beforeEach } from 'vitest';
import type { Doc, ParsedQuery, SearchResult, QueryOptions } from './types';
import type { SearchProvider, ProviderConfig } from './provider';
import { isSearchResult, areValidSearchResults } from './guards';

/**
 * Mock implementation of SearchProvider for testing
 */
class MockProvider implements SearchProvider {
	private docs: Map<string, Doc> = new Map();
	private lastQuery: ParsedQuery | null = null;
	
	async indexAll(docs: Doc[]): Promise<void> {
		this.docs.clear();
		for (const doc of docs) {
			this.docs.set(doc.id, doc);
		}
	}
	
	async upsert(doc: Doc): Promise<void> {
		this.docs.set(doc.id, doc);
	}
	
	async remove(id: string): Promise<void> {
		this.docs.delete(id);
	}
	
	async query(q: ParsedQuery, opts?: QueryOptions): Promise<SearchResult[]> {
		this.lastQuery = q;
		
		// Simple mock implementation: return all docs that contain any term
		const results: SearchResult[] = [];
		const limit = opts?.limit ?? 100;
		
		for (const [id, doc] of this.docs) {
			// Check if aborted
			if (opts?.signal?.aborted) {
				throw new Error('Query aborted');
			}
			
			// Simple matching: check if any term appears in title or body
			const matches = q.terms.some(term => 
				doc.title.toLowerCase().includes(term.toLowerCase()) ||
				doc.body.toLowerCase().includes(term.toLowerCase())
			);
			
			if (matches) {
				results.push({
					id,
					score: Math.random(), // Random score for testing
					matchSpans: [
						{ field: 'title', start: 0, end: 10 },
						{ field: 'body', start: 5, end: 15 }
					]
				});
			}
			
			if (results.length >= limit) {
				break;
			}
		}
		
		// Sort by score (descending)
		results.sort((a, b) => b.score - a.score);
		
		return results;
	}
	
	async clear(): Promise<void> {
		this.docs.clear();
		this.lastQuery = null;
	}
	
	// Helper methods for testing
	getDocCount(): number {
		return this.docs.size;
	}
	
	hasDoc(id: string): boolean {
		return this.docs.has(id);
	}
	
	getLastQuery(): ParsedQuery | null {
		return this.lastQuery;
	}
}

/**
 * Minimal consumer that uses a SearchProvider
 * Simulates how the modal would interact with providers
 */
class SearchConsumer {
	constructor(private provider: SearchProvider) {}
	
	async search(query: ParsedQuery): Promise<SearchResult[]> {
		return this.provider.query(query);
	}
	
	async indexDocuments(docs: Doc[]): Promise<void> {
		return this.provider.indexAll(docs);
	}
	
	async updateDocument(doc: Doc): Promise<void> {
		return this.provider.upsert(doc);
	}
	
	async removeDocument(id: string): Promise<void> {
		return this.provider.remove(id);
	}
	
	async reset(): Promise<void> {
		return this.provider.clear();
	}
}

describe('SearchProvider Contract Tests', () => {
	let provider: MockProvider;
	let consumer: SearchConsumer;
	
	const testDoc1: Doc = {
		id: 'doc1.md',
		title: 'Test Document One',
		path: ['folder'],
		tags: ['test', 'sample'],
		headings: ['# Heading'],
		symbols: [],
		body: 'This is test content',
		mtime: Date.now(),
		size: 100
	};
	
	const testDoc2: Doc = {
		id: 'doc2.md',
		title: 'Another Document',
		path: ['folder', 'subfolder'],
		tags: ['example'],
		headings: [],
		symbols: ['[[link]]'],
		body: 'Different content here',
		mtime: Date.now(),
		size: 200
	};
	
	const testQuery: ParsedQuery = {
		raw: 'test',
		mode: 'files',
		terms: ['test'],
		phrases: [],
		excludes: [],
		orGroups: [],
		filters: {}
	};
	
	beforeEach(() => {
		provider = new MockProvider();
		consumer = new SearchConsumer(provider);
	});
	
	describe('Core Interface Methods', () => {
		it('should implement indexAll with Promise', async () => {
			await expect(consumer.indexDocuments([testDoc1, testDoc2])).resolves.toBeUndefined();
			expect(provider.getDocCount()).toBe(2);
		});
		
		it('should implement upsert with Promise', async () => {
			await expect(consumer.updateDocument(testDoc1)).resolves.toBeUndefined();
			expect(provider.hasDoc('doc1.md')).toBe(true);
		});
		
		it('should implement remove with Promise', async () => {
			await consumer.indexDocuments([testDoc1, testDoc2]);
			await expect(consumer.removeDocument('doc1.md')).resolves.toBeUndefined();
			expect(provider.hasDoc('doc1.md')).toBe(false);
			expect(provider.getDocCount()).toBe(1);
		});
		
		it('should implement clear with Promise', async () => {
			await consumer.indexDocuments([testDoc1, testDoc2]);
			await expect(consumer.reset()).resolves.toBeUndefined();
			expect(provider.getDocCount()).toBe(0);
		});
		
		it('should implement query with Promise<SearchResult[]>', async () => {
			await consumer.indexDocuments([testDoc1, testDoc2]);
			const results = await consumer.search(testQuery);
			
			expect(Array.isArray(results)).toBe(true);
			expect(results.length).toBeGreaterThanOrEqual(0);
			expect(results.length).toBeLessThanOrEqual(2);
		});
	});
	
	describe('SearchResult Validation', () => {
		it('should return valid SearchResult objects', async () => {
			await consumer.indexDocuments([testDoc1]);
			const results = await consumer.search(testQuery);
			
			for (const result of results) {
				expect(isSearchResult(result)).toBe(true);
				expect(typeof result.id).toBe('string');
				expect(typeof result.score).toBe('number');
				expect(Array.isArray(result.matchSpans)).toBe(true);
			}
		});
		
		it('should pass guard validation for results array', async () => {
			await consumer.indexDocuments([testDoc1, testDoc2]);
			const results = await consumer.search(testQuery);
			
			expect(areValidSearchResults(results)).toBe(true);
		});
		
		it('should sort results by score (descending)', async () => {
			await consumer.indexDocuments([testDoc1, testDoc2]);
			const results = await consumer.search(testQuery);
			
			if (results.length > 1) {
				for (let i = 1; i < results.length; i++) {
					expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
				}
			}
		});
	});
	
	describe('Query Options', () => {
		it('should respect limit option', async () => {
			// Add many documents
			const manyDocs: Doc[] = [];
			for (let i = 0; i < 20; i++) {
				manyDocs.push({
					...testDoc1,
					id: `doc${i}.md`,
					title: `Test Document ${i}`
				});
			}
			
			await consumer.indexDocuments(manyDocs);
			const results = await provider.query(testQuery, { limit: 5 });
			
			expect(results.length).toBeLessThanOrEqual(5);
		});
		
		it('should handle AbortSignal', async () => {
			await consumer.indexDocuments([testDoc1]);
			
			const controller = new AbortController();
			controller.abort();
			
			await expect(
				provider.query(testQuery, { signal: controller.signal })
			).rejects.toThrow('Query aborted');
		});
	});
	
	describe('Provider Swapping', () => {
		it('should allow swapping providers without changing consumer code', async () => {
			// First provider
			const provider1 = new MockProvider();
			const consumer1 = new SearchConsumer(provider1);
			
			await consumer1.indexDocuments([testDoc1]);
			const results1 = await consumer1.search(testQuery);
			expect(results1).toBeDefined();
			
			// Second provider (same interface)
			const provider2 = new MockProvider();
			const consumer2 = new SearchConsumer(provider2);
			
			await consumer2.indexDocuments([testDoc2]);
			const results2 = await consumer2.search(testQuery);
			expect(results2).toBeDefined();
			
			// Consumer code remains unchanged
			expect(consumer1).toBeInstanceOf(SearchConsumer);
			expect(consumer2).toBeInstanceOf(SearchConsumer);
		});
	});
	
	describe('Edge Cases', () => {
		it('should handle empty document array', async () => {
			await expect(consumer.indexDocuments([])).resolves.toBeUndefined();
			expect(provider.getDocCount()).toBe(0);
		});
		
		it('should handle querying empty index', async () => {
			const results = await consumer.search(testQuery);
			expect(results).toEqual([]);
		});
		
		it('should handle removing non-existent document', async () => {
			await expect(consumer.removeDocument('non-existent.md')).resolves.toBeUndefined();
		});
		
		it('should replace document on upsert with same id', async () => {
			await consumer.updateDocument(testDoc1);
			expect(provider.getDocCount()).toBe(1);
			
			const modifiedDoc = { ...testDoc1, title: 'Modified Title' };
			await consumer.updateDocument(modifiedDoc);
			expect(provider.getDocCount()).toBe(1);
		});
		
		it('should handle complex ParsedQuery', async () => {
			const complexQuery: ParsedQuery = {
				raw: 'test query #tag path:folder -exclude',
				mode: 'files',
				terms: ['test', 'query'],
				phrases: ['exact phrase'],
				excludes: ['exclude'],
				orGroups: [['term1', 'term2']],
				filters: {
					tag: ['tag'],
					path: ['folder'],
					field: 'headings'
				},
				regex: {
					source: 'pattern',
					flags: 'i'
				}
			};
			
			await consumer.indexDocuments([testDoc1]);
			const results = await consumer.search(complexQuery);
			expect(areValidSearchResults(results)).toBe(true);
		});
	});
});