// ABOUTME: Performance testing harness with timing probes and budget enforcement
// ABOUTME: Provides utilities for measuring and asserting performance characteristics

export interface PerformanceBudget {
	/** Maximum time for first result (ms) */
	timeToFirstResult: number;
	/** Maximum total query time (ms) */
	totalQueryTime: number;
	/** Maximum time for any single operation (ms) */
	maxOperationTime: number;
	/** Maximum indexing time per document (ms) */
	indexingPerDoc: number;
}

export interface PerformanceMetrics {
	/** Time to first result (ms) */
	timeToFirstResult?: number;
	/** Total time for complete operation (ms) */
	totalTime: number;
	/** Number of results processed */
	resultCount: number;
	/** Memory usage delta (bytes) */
	memoryDelta?: number;
	/** Individual operation timings */
	operationTimings: Array<{ name: string; duration: number }>;
}

/**
 * Default performance budgets based on Task 10.4 requirements
 */
export const PERFORMANCE_BUDGETS = {
	unit: {
		timeToFirstResult: 50,
		totalQueryTime: 200,
		maxOperationTime: 50,
		indexingPerDoc: 1
	} as PerformanceBudget,
	
	integration: {
		timeToFirstResult: 100,
		totalQueryTime: 200,
		maxOperationTime: 50,
		indexingPerDoc: 2
	} as PerformanceBudget,
	
	e2e: {
		timeToFirstResult: 300,
		totalQueryTime: 500,
		maxOperationTime: 100,
		indexingPerDoc: 5
	} as PerformanceBudget
};

/**
 * High-precision timer for performance measurements
 */
export class PerformanceTimer {
	private startTime: number = 0;
	private operations: Array<{ name: string; start: number; end?: number }> = [];
	private memoryStart?: { used: number; total: number };

	start(): void {
		this.startTime = performance.now();
		this.operations = [];
		
		// Capture initial memory usage if available
		if (typeof process !== 'undefined' && process.memoryUsage) {
			const usage = process.memoryUsage();
			this.memoryStart = { used: usage.heapUsed, total: usage.heapTotal };
		}
	}

	markOperation(name: string): void {
		const now = performance.now();
		
		// End previous operation if exists
		const lastOp = this.operations[this.operations.length - 1];
		if (lastOp && !lastOp.end) {
			lastOp.end = now;
		}
		
		// Start new operation
		this.operations.push({ name, start: now });
	}

	end(): PerformanceMetrics {
		const endTime = performance.now();
		
		// End last operation
		const lastOp = this.operations[this.operations.length - 1];
		if (lastOp && !lastOp.end) {
			lastOp.end = endTime;
		}

		// Calculate memory delta
		let memoryDelta: number | undefined;
		if (this.memoryStart && typeof process !== 'undefined' && process.memoryUsage) {
			const usage = process.memoryUsage();
			memoryDelta = usage.heapUsed - this.memoryStart.used;
		}

		// Calculate operation timings
		const operationTimings = this.operations
			.filter(op => op.end)
			.map(op => ({
				name: op.name,
				duration: op.end! - op.start
			}));

		return {
			totalTime: endTime - this.startTime,
			resultCount: 0, // Will be set by caller
			memoryDelta,
			operationTimings
		};
	}

	/**
	 * Get time to first meaningful result
	 */
	getTimeToFirstResult(): number | undefined {
		const firstResult = this.operations.find(op => op.name.includes('first-result'));
		return firstResult ? firstResult.start - this.startTime : undefined;
	}
}

/**
 * Assert performance metrics meet budget requirements
 */
export function assertPerformanceBudget(
	metrics: PerformanceMetrics, 
	budget: PerformanceBudget,
	testName: string = 'operation'
): void {
	// Check total time
	if (metrics.totalTime > budget.totalQueryTime) {
		throw new Error(
			`Performance budget exceeded for ${testName}: ` +
			`total time ${metrics.totalTime.toFixed(1)}ms > budget ${budget.totalQueryTime}ms`
		);
	}

	// Check time to first result if available
	if (metrics.timeToFirstResult && metrics.timeToFirstResult > budget.timeToFirstResult) {
		throw new Error(
			`Performance budget exceeded for ${testName}: ` +
			`time to first result ${metrics.timeToFirstResult.toFixed(1)}ms > budget ${budget.timeToFirstResult}ms`
		);
	}

	// Check individual operations
	for (const op of metrics.operationTimings) {
		if (op.duration > budget.maxOperationTime) {
			throw new Error(
				`Performance budget exceeded for ${testName}: ` +
				`operation "${op.name}" took ${op.duration.toFixed(1)}ms > budget ${budget.maxOperationTime}ms`
			);
		}
	}
}

/**
 * Measure async operation with automatic timing
 */
export async function measureAsync<T>(
	operation: () => Promise<T>,
	operationName: string = 'async-operation'
): Promise<{ result: T; metrics: PerformanceMetrics }> {
	const timer = new PerformanceTimer();
	timer.start();
	timer.markOperation(operationName);
	
	const result = await operation();
	
	const metrics = timer.end();
	return { result, metrics };
}

/**
 * Measure synchronous operation with automatic timing
 */
export function measureSync<T>(
	operation: () => T,
	operationName: string = 'sync-operation'
): { result: T; metrics: PerformanceMetrics } {
	const timer = new PerformanceTimer();
	timer.start();
	timer.markOperation(operationName);
	
	const result = operation();
	
	const metrics = timer.end();
	return { result, metrics };
}

/**
 * Performance test decorator for easy integration with test suites
 */
export function withPerformanceBudget<T>(
	budget: PerformanceBudget,
	testName?: string
) {
	return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;
		
		descriptor.value = async function(...args: any[]) {
			const timer = new PerformanceTimer();
			timer.start();
			
			const result = await originalMethod.apply(this, args);
			
			const metrics = timer.end();
			assertPerformanceBudget(metrics, budget, testName || propertyKey);
			
			return result;
		};
		
		return descriptor;
	};
}

/**
 * Memory usage tracker for detecting memory leaks
 */
export class MemoryTracker {
	private baselines: Map<string, number> = new Map();

	setBaseline(name: string): void {
		if (typeof process !== 'undefined' && process.memoryUsage) {
			const usage = process.memoryUsage();
			this.baselines.set(name, usage.heapUsed);
		}
	}

	checkMemoryLeak(name: string, maxLeakMB: number = 10): void {
		if (typeof process === 'undefined' || !process.memoryUsage) {
			return; // Skip in browser environment
		}

		const baseline = this.baselines.get(name);
		if (!baseline) {
			throw new Error(`No baseline set for memory check: ${name}`);
		}

		const current = process.memoryUsage().heapUsed;
		const leakMB = (current - baseline) / (1024 * 1024);

		if (leakMB > maxLeakMB) {
			throw new Error(
				`Memory leak detected in ${name}: ` +
				`${leakMB.toFixed(1)}MB increase > ${maxLeakMB}MB limit`
			);
		}
	}

	getCurrentMemoryMB(): number {
		if (typeof process !== 'undefined' && process.memoryUsage) {
			return process.memoryUsage().heapUsed / (1024 * 1024);
		}
		return 0;
	}
}

/**
 * Long task detector for identifying blocking operations
 */
export class LongTaskDetector {
	private longTasks: Array<{ duration: number; timestamp: number }> = [];
	private threshold: number;

	constructor(thresholdMs: number = 50) {
		this.threshold = thresholdMs;
	}

	startMonitoring(): void {
		// Reset tracking
		this.longTasks = [];

		// In browser environment, use PerformanceObserver for long tasks
		if (typeof PerformanceObserver !== 'undefined') {
			const observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (entry.duration > this.threshold) {
						this.longTasks.push({
							duration: entry.duration,
							timestamp: entry.startTime
						});
					}
				}
			});
			observer.observe({ entryTypes: ['longtask'] });
		}
	}

	getLongTasks(): Array<{ duration: number; timestamp: number }> {
		return [...this.longTasks];
	}

	assertNoLongTasks(testName: string = 'operation'): void {
		if (this.longTasks.length > 0) {
			const worstTask = this.longTasks.reduce((max, task) => 
				task.duration > max.duration ? task : max
			);
			
			throw new Error(
				`Long task detected in ${testName}: ` +
				`${worstTask.duration.toFixed(1)}ms > ${this.threshold}ms threshold. ` +
				`Total long tasks: ${this.longTasks.length}`
			);
		}
	}
}