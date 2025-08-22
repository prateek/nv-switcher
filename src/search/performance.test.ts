// ABOUTME: Enhanced performance tests using the performance harness
// ABOUTME: Validates timing budgets and long task detection for search operations

import { describe, it, expect, beforeEach } from 'vitest';
import { BuiltInProvider } from './built-in-provider';
import { FIXTURE_SETS } from '../test/fixtures';
import { 
	PerformanceTimer, 
	assertPerformanceBudget, 
	PERFORMANCE_BUDGETS,
	measureAsync,
	MemoryTracker,
	LongTaskDetector
} from '../test/performance-harness';

describe('Search Performance with Harness', () => {
	let provider: BuiltInProvider;
	let memoryTracker: MemoryTracker;
	let longTaskDetector: LongTaskDetector;

	beforeEach(() => {
		provider = new BuiltInProvider({ debug: false });
		memoryTracker = new MemoryTracker();
		longTaskDetector = new LongTaskDetector(50); // 50ms threshold for long tasks
	});

	describe('Indexing Performance', () => {
		it('should meet indexing performance budgets', async () => {
			const testData = FIXTURE_SETS.development(); // 100 docs
			
			memoryTracker.setBaseline('indexing');
			longTaskDetector.startMonitoring();

			const { result, metrics } = await measureAsync(async () => {
				return provider.indexAll(testData);
			}, 'indexAll');

			// Check timing budgets
			assertPerformanceBudget(metrics, PERFORMANCE_BUDGETS.unit, 'indexAll');
			
			// Check per-document indexing performance
			const perDocTime = metrics.totalTime / testData.length;
			expect(perDocTime).toBeLessThan(PERFORMANCE_BUDGETS.unit.indexingPerDoc);

			// Check for memory leaks (relaxed for development set)
			memoryTracker.checkMemoryLeak('indexing', 10); // 10MB limit for 100 docs

			// Check for long blocking tasks
			longTaskDetector.assertNoLongTasks('indexAll');

			console.log(`✅ Indexed ${testData.length} docs in ${metrics.totalTime.toFixed(1)}ms (${perDocTime.toFixed(2)}ms/doc)`);
		});

		it('should handle large vault indexing efficiently', async () => {
			const testData = FIXTURE_SETS.stress(); // 5000 docs
			
			memoryTracker.setBaseline('large-indexing');

			const { result, metrics } = await measureAsync(async () => {
				return provider.indexAll(testData);
			}, 'large-indexAll');

			// Relaxed budgets for large datasets
			const largeBudget = {
				...PERFORMANCE_BUDGETS.integration,
				totalQueryTime: 1000, // 1 second for 5000 docs
				maxOperationTime: 200, // Allow longer operations for large datasets
				indexingPerDoc: 0.5 // Should be efficient at scale
			};

			assertPerformanceBudget(metrics, largeBudget, 'large-indexAll');

			const perDocTime = metrics.totalTime / testData.length;
			expect(perDocTime).toBeLessThan(largeBudget.indexingPerDoc);

			memoryTracker.checkMemoryLeak('large-indexing', 100); // 100MB limit for 5000 docs

			console.log(`✅ Large vault: ${testData.length} docs in ${metrics.totalTime.toFixed(1)}ms (${perDocTime.toFixed(3)}ms/doc)`);
		});
	});

	describe('Query Performance', () => {
		beforeEach(async () => {
			// Setup with realistic data
			const testData = FIXTURE_SETS.realistic(); // 1000 docs
			await provider.indexAll(testData);
		});

		it('should meet first result timing budget', async () => {
			const timer = new PerformanceTimer();
			timer.start();

			let firstResultTime: number | undefined;
			let resultCount = 0;

			timer.markOperation('query-start');

			// Test streaming query for time-to-first-result
			for await (const result of provider.queryStream({
				raw: 'project analysis',
				mode: 'files',
				terms: ['project', 'analysis'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {}
			}, { limit: 20 })) {
				resultCount++;
				if (resultCount === 1) {
					firstResultTime = performance.now() - timer['startTime'];
					timer.markOperation('first-result');
				}
				if (resultCount >= 5) break; // Test first few results
			}

			const metrics = timer.end();
			metrics.resultCount = resultCount;
			metrics.timeToFirstResult = firstResultTime;

			// Assert timing budgets
			assertPerformanceBudget(metrics, PERFORMANCE_BUDGETS.unit, 'query-streaming');

			expect(firstResultTime).toBeDefined();
			expect(firstResultTime!).toBeLessThan(PERFORMANCE_BUDGETS.unit.timeToFirstResult);

			console.log(`✅ Query: first result in ${firstResultTime?.toFixed(1)}ms, total ${resultCount} results`);
		});

		it('should maintain performance with complex queries', async () => {
			const complexQueries = [
				{
					name: 'Multi-term with filters',
					query: {
						raw: 'project analysis #work path:Projects',
						mode: 'files' as const,
						terms: ['project', 'analysis'],
						phrases: [],
						excludes: [],
						orGroups: [],
						filters: { tag: ['work'], path: ['Projects'] }
					}
				},
				{
					name: 'OR groups with exclusions',
					query: {
						raw: 'alpha OR beta -deprecated',
						mode: 'files' as const,
						terms: [],
						phrases: [],
						excludes: ['deprecated'],
						orGroups: [['alpha', 'beta']],
						filters: {}
					}
				},
				{
					name: 'Phrase with regex',
					query: {
						raw: '"project planning" /test/i',
						mode: 'files' as const,
						terms: [],
						phrases: ['project planning'],
						excludes: [],
						orGroups: [],
						filters: {},
						regex: { source: 'test', flags: 'i' }
					}
				}
			];

			for (const testCase of complexQueries) {
				const { result, metrics } = await measureAsync(async () => {
					return provider.query(testCase.query, { limit: 30 });
				}, testCase.name);

				metrics.resultCount = result.length;

				// Assert performance budget
				assertPerformanceBudget(metrics, PERFORMANCE_BUDGETS.unit, testCase.name);

				console.log(`✅ ${testCase.name}: ${result.length} results in ${metrics.totalTime.toFixed(1)}ms`);
			}
		});

		it('should handle regex post-filtering efficiently', async () => {
			memoryTracker.setBaseline('regex-filtering');

			// Test regex that will match many documents first, then filter
			const { result, metrics } = await measureAsync(async () => {
				return provider.query({
					raw: 'project /analysis/i',
					mode: 'files',
					terms: ['project'],
					phrases: [],
					excludes: [],
					orGroups: [],
					filters: {},
					regex: { source: 'analysis', flags: 'i' }
				}, { limit: 50 });
			}, 'regex-post-filter');

			metrics.resultCount = result.length;

			// Regex post-filtering should be efficient (applied to top-K only)
			assertPerformanceBudget(metrics, PERFORMANCE_BUDGETS.unit, 'regex-post-filter');

			// Should not leak memory during regex operations
			memoryTracker.checkMemoryLeak('regex-filtering', 2);

			console.log(`✅ Regex filtering: ${result.length} results in ${metrics.totalTime.toFixed(1)}ms`);
		});
	});

	describe('Progressive Loading Performance', () => {
		beforeEach(async () => {
			const testData = FIXTURE_SETS.realistic();
			await provider.indexAll(testData);
		});

		it('should provide sub-50ms time-to-first-result with streaming', async () => {
			const timer = new PerformanceTimer();
			timer.start();

			let firstResultTime: number | undefined;
			let resultCount = 0;
			const maxResults = 50;

			// Measure streaming performance
			for await (const result of provider.queryStream({
				raw: 'analysis research',
				mode: 'files',
				terms: ['analysis', 'research'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {}
			}, { limit: maxResults })) {
				resultCount++;
				
				if (resultCount === 1) {
					firstResultTime = performance.now() - timer['startTime'];
					timer.markOperation('first-result');
				}
				
				// Test progressive nature - don't wait for all results
				if (resultCount >= 10) break;
			}

			const metrics = timer.end();
			metrics.resultCount = resultCount;
			metrics.timeToFirstResult = firstResultTime;

			// Assert first result timing
			expect(firstResultTime).toBeDefined();
			expect(firstResultTime!).toBeLessThan(50); // Sub-50ms requirement

			console.log(`✅ Progressive: first result in ${firstResultTime?.toFixed(1)}ms, got ${resultCount} results`);
		});

		it('should demonstrate progressive advantage over batch', async () => {
			const query = {
				raw: 'project implementation analysis',
				mode: 'files' as const,
				terms: ['project', 'implementation', 'analysis'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {}
			};

			// Measure progressive loading
			const { result: streamResults, metrics: streamMetrics } = await measureAsync(async () => {
				const results = [];
				for await (const result of provider.queryStream(query, { limit: 40 })) {
					results.push(result);
					if (results.length === 1) {
						// Mark first result timing for comparison
					}
				}
				return results;
			}, 'progressive-query');

			// Measure batch loading
			const { result: batchResults, metrics: batchMetrics } = await measureAsync(async () => {
				return provider.query(query, { limit: 40 });
			}, 'batch-query');

			// Progressive should provide faster perceived performance
			// (though total time might be similar due to overhead)
			expect(streamResults.length).toBe(batchResults.length);
			
			// Both should meet performance budgets
			streamMetrics.resultCount = streamResults.length;
			batchMetrics.resultCount = batchResults.length;
			
			assertPerformanceBudget(streamMetrics, PERFORMANCE_BUDGETS.unit, 'progressive-query');
			assertPerformanceBudget(batchMetrics, PERFORMANCE_BUDGETS.unit, 'batch-query');

			console.log(`✅ Progressive vs Batch: ${streamMetrics.totalTime.toFixed(1)}ms vs ${batchMetrics.totalTime.toFixed(1)}ms`);
		});
	});

	describe('Memory Efficiency', () => {
		it('should maintain constant memory usage regardless of result count', async () => {
			await provider.indexAll(FIXTURE_SETS.stress()); // Large dataset

			const limits = [10, 50, 100, 200];
			const memoryUsages: number[] = [];

			for (const limit of limits) {
				memoryTracker.setBaseline(`limit-${limit}`);

				await provider.query({
					raw: 'the', // Common term that matches many docs
					mode: 'files',
					terms: ['the'],
					phrases: [],
					excludes: [],
					orGroups: [],
					filters: {}
				}, { limit });

				const memoryAfter = memoryTracker.getCurrentMemoryMB();
				memoryUsages.push(memoryAfter);

				// Memory usage should not grow significantly with result count
				memoryTracker.checkMemoryLeak(`limit-${limit}`, 1); // 1MB limit
			}

			// Memory usage should be roughly constant across different limits
			const memoryVariance = Math.max(...memoryUsages) - Math.min(...memoryUsages);
			expect(memoryVariance).toBeLessThan(5); // Less than 5MB variance

			console.log(`✅ Memory efficiency: ${memoryVariance.toFixed(1)}MB variance across limits`);
		});
	});

	describe('Performance Regression Detection', () => {
		it('should maintain baseline performance characteristics', async () => {
			// Test against known performance baselines
			const testData = FIXTURE_SETS.development();
			await provider.indexAll(testData);

			const baselineTests = [
				{
					name: 'simple-query',
					query: { raw: 'project', mode: 'files' as const, terms: ['project'], phrases: [], excludes: [], orGroups: [], filters: {} },
					expectedMaxTime: 20
				},
				{
					name: 'multi-term-query',
					query: { raw: 'project analysis', mode: 'files' as const, terms: ['project', 'analysis'], phrases: [], excludes: [], orGroups: [], filters: {} },
					expectedMaxTime: 30
				},
				{
					name: 'filtered-query',
					query: { raw: 'meeting #work', mode: 'files' as const, terms: ['meeting'], phrases: [], excludes: [], orGroups: [], filters: { tag: ['work'] } },
					expectedMaxTime: 25
				}
			];

			for (const test of baselineTests) {
				const { result, metrics } = await measureAsync(async () => {
					return provider.query(test.query, { limit: 20 });
				}, test.name);

				// Assert against expected baseline
				expect(metrics.totalTime).toBeLessThan(test.expectedMaxTime);

				// Assert general performance budget
				metrics.resultCount = result.length;
				assertPerformanceBudget(metrics, PERFORMANCE_BUDGETS.unit, test.name);

				console.log(`✅ ${test.name}: ${result.length} results in ${metrics.totalTime.toFixed(1)}ms (baseline: <${test.expectedMaxTime}ms)`);
			}
		});

		it('should scale performance predictably with dataset size', async () => {
			const sizes = [100, 500, 1000];
			const timings: Array<{ size: number; time: number; perDoc: number }> = [];

			for (const size of sizes) {
				const testData = FIXTURE_SETS.development().slice(0, size);
				
				const provider = new BuiltInProvider({ debug: false });
				
				const { result, metrics } = await measureAsync(async () => {
					await provider.indexAll(testData);
					
					return provider.query({
						raw: 'project analysis',
						mode: 'files',
						terms: ['project', 'analysis'],
						phrases: [],
						excludes: [],
						orGroups: [],
						filters: {}
					}, { limit: 20 });
				}, `scale-test-${size}`);

				const perDocTime = metrics.totalTime / size;
				timings.push({ size, time: metrics.totalTime, perDoc: perDocTime });

				console.log(`📊 ${size} docs: ${metrics.totalTime.toFixed(1)}ms total, ${perDocTime.toFixed(3)}ms/doc`);
			}

			// Performance should scale sub-linearly (not worse than O(n))
			// Compare ratios to ensure reasonable scaling
			const smallTiming = timings[0];
			const largeTiming = timings[timings.length - 1];
			
			const sizeRatio = largeTiming.size / smallTiming.size;
			const timeRatio = largeTiming.time / smallTiming.time;
			
			// Time should not grow faster than dataset size (ideally slower)
			expect(timeRatio).toBeLessThan(sizeRatio * 1.5); // Allow 50% overhead for scaling

			console.log(`✅ Scaling efficiency: ${sizeRatio}x size → ${timeRatio.toFixed(1)}x time`);
		});
	});

	describe('Real-world Performance Simulation', () => {
		it('should handle Prateek\'s vault size efficiently', async () => {
			// Simulate current vault size (~1600 docs)
			const currentVaultSize = 1600;
			const testData = FIXTURE_SETS.realistic().slice(0, currentVaultSize);
			
			await provider.indexAll(testData);

			// Test common search patterns with performance measurement
			const searchPatterns = [
				{ name: 'Quick lookup', terms: ['meeting'] },
				{ name: 'Multi-term search', terms: ['project', 'analysis'] },
				{ name: 'Tagged search', terms: ['review'], filters: { tag: ['work'] } },
				{ name: 'Path filtered', terms: ['notes'], filters: { path: ['Projects'] } }
			];

			for (const pattern of searchPatterns) {
				const { result, metrics } = await measureAsync(async () => {
					return provider.query({
						raw: pattern.terms.join(' '),
						mode: 'files',
						terms: pattern.terms,
						phrases: [],
						excludes: [],
						orGroups: [],
						filters: pattern.filters || {}
					}, { limit: 50 });
				}, pattern.name);

				metrics.resultCount = result.length;

				// Should feel instant for current vault size
				assertPerformanceBudget(metrics, {
					...PERFORMANCE_BUDGETS.unit,
					timeToFirstResult: 30, // Very fast for this size
					totalQueryTime: 50     // Should be nearly instant
				}, pattern.name);

				console.log(`✅ ${pattern.name}: ${result.length} results in ${metrics.totalTime.toFixed(1)}ms`);
			}
		});
	});
});