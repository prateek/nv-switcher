// ABOUTME: Unit tests for MinHeap utility class used in search result optimization
// ABOUTME: Tests heap operations, top-K maintenance, and search result-specific functionality

import { describe, it, expect } from 'vitest';
import { MinHeap, createSearchResultHeap } from './min-heap';

describe('MinHeap', () => {
	describe('Basic Operations', () => {
		it('should maintain min-heap property with numbers', () => {
			const heap = new MinHeap<number>(0, (a, b) => a - b);
			
			const values = [5, 3, 8, 1, 9, 2, 7];
			for (const value of values) {
				heap.push(value);
			}
			
			expect(heap.size).toBe(7);
			expect(heap.peek()).toBe(1); // Minimum should be at top
			
			// Extract all items - should come out in sorted order
			const extracted = heap.extractAll();
			expect(extracted).toEqual([1, 2, 3, 5, 7, 8, 9]);
			expect(heap.isEmpty).toBe(true);
		});

		it('should handle empty heap operations', () => {
			const heap = new MinHeap<number>(0, (a, b) => a - b);
			
			expect(heap.size).toBe(0);
			expect(heap.isEmpty).toBe(true);
			expect(heap.peek()).toBeUndefined();
			expect(heap.pop()).toBeUndefined();
			expect(heap.extractAll()).toEqual([]);
		});

		it('should handle single item', () => {
			const heap = new MinHeap<number>(0, (a, b) => a - b);
			
			heap.push(42);
			expect(heap.size).toBe(1);
			expect(heap.peek()).toBe(42);
			
			const popped = heap.pop();
			expect(popped).toBe(42);
			expect(heap.isEmpty).toBe(true);
		});
	});

	describe('Size-Limited Heap (Top-K)', () => {
		it('should maintain only top-K items', () => {
			const heap = new MinHeap<number>(3, (a, b) => a - b);
			
			// Add more items than the limit
			const values = [5, 3, 8, 1, 9, 2, 7, 6, 4];
			for (const value of values) {
				heap.push(value);
			}
			
			expect(heap.size).toBe(3);
			
			// Should contain the 3 largest values
			const extracted = heap.extractAll().sort((a, b) => b - a);
			expect(extracted).toEqual([9, 8, 7]);
		});

		it('should reject items smaller than minimum when full', () => {
			const heap = new MinHeap<number>(2, (a, b) => a - b);
			
			heap.push(5);
			heap.push(8);
			
			// Heap is full, try to add smaller item
			const rejected = heap.push(3);
			expect(rejected).toBe(false);
			expect(heap.size).toBe(2);
			
			// Try to add larger item
			const accepted = heap.push(10);
			expect(accepted).toBe(true);
			expect(heap.size).toBe(2);
			
			const extracted = heap.extractAll().sort((a, b) => b - a);
			expect(extracted).toEqual([10, 8]); // Should have 10, 8 (not 5, 3)
		});

		it('should handle duplicate values correctly', () => {
			const heap = new MinHeap<number>(3, (a, b) => a - b);
			
			heap.push(5);
			heap.push(5);
			heap.push(5);
			heap.push(10); // Should replace one of the 5s
			
			expect(heap.size).toBe(3);
			
			const extracted = heap.extractAll();
			expect(extracted).toEqual([5, 5, 10]);
		});
	});

	describe('Search Result Heap', () => {
		it('should work with search results', () => {
			const heap = createSearchResultHeap(3);
			
			const results = [
				{ id: 'doc1', score: 5.0, matchSpans: [] },
				{ id: 'doc2', score: 8.0, matchSpans: [] },
				{ id: 'doc3', score: 3.0, matchSpans: [] },
				{ id: 'doc4', score: 9.0, matchSpans: [] }, // Should replace doc3
				{ id: 'doc5', score: 2.0, matchSpans: [] }, // Should be rejected
			];
			
			for (const result of results) {
				heap.push(result);
			}
			
			expect(heap.size).toBe(3);
			
			// Should contain top 3 scores: 9.0, 8.0, 5.0
			const extracted = heap.extractAll().reverse(); // Highest scores first
			expect(extracted.map(r => r.score)).toEqual([9.0, 8.0, 5.0]);
			expect(extracted.map(r => r.id)).toEqual(['doc4', 'doc2', 'doc1']);
		});

		it('should maintain heap property with equal scores', () => {
			const heap = createSearchResultHeap(2);
			
			heap.push({ id: 'doc1', score: 5.0, matchSpans: [] });
			heap.push({ id: 'doc2', score: 5.0, matchSpans: [] });
			heap.push({ id: 'doc3', score: 5.0, matchSpans: [] });
			
			expect(heap.size).toBe(2);
			
			// Should contain any 2 of the equal-scored items
			const extracted = heap.extractAll();
			expect(extracted.every(r => r.score === 5.0)).toBe(true);
		});
	});

	describe('Performance Characteristics', () => {
		it('should be efficient for large datasets', () => {
			const heap = new MinHeap<number>(100, (a, b) => a - b);
			
			const start = performance.now();
			
			// Add 10,000 random numbers
			for (let i = 0; i < 10000; i++) {
				heap.push(Math.random() * 1000);
			}
			
			const duration = performance.now() - start;
			
			// Should be fast even for large datasets
			expect(duration).toBeLessThan(100); // <100ms for 10K insertions
			expect(heap.size).toBe(100); // Should maintain exactly 100 items
			
			// Extracted items should be the 100 largest
			const extracted = heap.extractAll();
			expect(extracted).toHaveLength(100);
			
			// Should be sorted
			for (let i = 1; i < extracted.length; i++) {
				expect(extracted[i]).toBeGreaterThanOrEqual(extracted[i - 1]);
			}
		});
	});
});