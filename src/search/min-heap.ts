// ABOUTME: MinHeap implementation for efficient top-K result management in search queries
// ABOUTME: Provides O(log k) insertions and O(k log k) extraction for maintaining best results

/**
 * Generic min-heap implementation optimized for maintaining top-K search results.
 * Uses a comparator function to determine ordering.
 */
export class MinHeap<T> {
	private items: T[] = [];
	private readonly maxSize: number;
	private readonly compare: (a: T, b: T) => number;

	/**
	 * Create a new MinHeap with optional size limit
	 * @param maxSize Maximum number of items to maintain (0 = unlimited)
	 * @param compareFn Comparison function: (a, b) => number
	 *                  - Returns < 0 if a should come before b
	 *                  - Returns > 0 if a should come after b
	 *                  - Returns 0 if equal
	 */
	constructor(maxSize: number = 0, compareFn: (a: T, b: T) => number) {
		this.maxSize = maxSize;
		this.compare = compareFn;
	}

	/**
	 * Get the number of items in the heap
	 */
	get size(): number {
		return this.items.length;
	}

	/**
	 * Check if the heap is empty
	 */
	get isEmpty(): boolean {
		return this.items.length === 0;
	}

	/**
	 * Peek at the minimum item without removing it
	 */
	peek(): T | undefined {
		return this.items[0];
	}

	/**
	 * Add an item to the heap
	 * If heap is at maxSize, replaces minimum if new item is larger
	 */
	push(item: T): boolean {
		if (this.maxSize > 0 && this.items.length >= this.maxSize) {
			// Heap is full - check if new item should replace minimum
			if (this.compare(item, this.items[0]) <= 0) {
				return false; // New item is smaller/equal to minimum, reject
			}
			// Replace minimum with new item
			this.items[0] = item;
			this.heapifyDown(0);
			return true;
		}

		// Add new item and bubble up
		this.items.push(item);
		this.heapifyUp(this.items.length - 1);
		return true;
	}

	/**
	 * Remove and return the minimum item
	 */
	pop(): T | undefined {
		if (this.items.length === 0) return undefined;
		if (this.items.length === 1) return this.items.pop();

		const min = this.items[0];
		this.items[0] = this.items.pop()!;
		this.heapifyDown(0);
		return min;
	}

	/**
	 * Extract all items in sorted order (smallest to largest)
	 * This empties the heap
	 */
	extractAll(): T[] {
		const result: T[] = [];
		while (!this.isEmpty) {
			result.push(this.pop()!);
		}
		return result;
	}

	/**
	 * Get all items as array without modifying heap
	 */
	toArray(): T[] {
		return [...this.items];
	}

	/**
	 * Clear all items from the heap
	 */
	clear(): void {
		this.items.length = 0;
	}

	/**
	 * Bubble item up to restore heap property
	 */
	private heapifyUp(index: number): void {
		while (index > 0) {
			const parentIndex = Math.floor((index - 1) / 2);
			if (this.compare(this.items[index], this.items[parentIndex]) >= 0) {
				break; // Heap property satisfied
			}
			this.swap(index, parentIndex);
			index = parentIndex;
		}
	}

	/**
	 * Bubble item down to restore heap property
	 */
	private heapifyDown(index: number): void {
		while (true) {
			let minIndex = index;
			const leftChild = 2 * index + 1;
			const rightChild = 2 * index + 2;

			if (leftChild < this.items.length && 
				this.compare(this.items[leftChild], this.items[minIndex]) < 0) {
				minIndex = leftChild;
			}

			if (rightChild < this.items.length && 
				this.compare(this.items[rightChild], this.items[minIndex]) < 0) {
				minIndex = rightChild;
			}

			if (minIndex === index) {
				break; // Heap property satisfied
			}

			this.swap(index, minIndex);
			index = minIndex;
		}
	}

	/**
	 * Swap two items in the heap
	 */
	private swap(i: number, j: number): void {
		[this.items[i], this.items[j]] = [this.items[j], this.items[i]];
	}
}

/**
 * Create a min-heap for search results (lowest scores at top)
 * This allows us to efficiently maintain the top-K highest scoring results
 */
export function createSearchResultHeap(maxSize: number): MinHeap<{ id: string; score: number; matchSpans: any[] }> {
	return new MinHeap(maxSize, (a, b) => a.score - b.score);
}