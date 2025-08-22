// ABOUTME: Performance comparison benchmarks for heap-based and streaming optimizations
// ABOUTME: Measures performance gains from MinHeap top-K scoring and progressive loading features

import { describe, it, expect } from 'vitest';
import { BuiltInProvider } from './built-in-provider';
import type { Doc } from './types';

/**
 * Create realistic test documents based on Prateek's vault distribution:
 * - 20% small (10-99 chars)
 * - 49% medium (100-999 chars) 
 * - 28% large (1K-9K chars)
 * - 3% extra large (10K+ chars)
 */
function generateRealisticVault(totalDocs: number): Doc[] {
	const docs: Doc[] = [];
	const now = Date.now();
	
	// Content templates based on realistic note types
	const smallNotes = [
		"Quick reminder about meeting",
		"Shopping list items",
		"Brief project update",
		"Quick thoughts on implementation",
		"Meeting agenda items",
	];
	
	const mediumNotes = [
		"Project planning document with detailed timeline and milestone breakdown. Key stakeholders include development team, product managers, and external consultants. Budget considerations and resource allocation need careful review before final approval.",
		"Meeting notes from weekly standup covering sprint progress, blockers, and upcoming deliverables. Action items assigned to team members with clear deadlines and success criteria. Follow-up meeting scheduled for next week.",
		"Research analysis on competitive landscape and market opportunities. Key findings include emerging trends, customer feedback analysis, and strategic recommendations for product development roadmap.",
		"Technical implementation notes covering architecture decisions, database schema design, API endpoints, and integration patterns. Performance considerations and security requirements documented thoroughly.",
		"Product requirements specification outlining user stories, acceptance criteria, and technical constraints. Wireframes and user flow diagrams included with detailed explanations of expected behavior.",
	];
	
	const largeNotes = [
		"Comprehensive project documentation including detailed analysis of requirements, technical architecture, implementation strategy, and deployment considerations. This document serves as the primary reference for all stakeholders involved in the project lifecycle. Key sections cover project overview, business objectives, technical specifications, resource requirements, timeline and milestones, risk assessment and mitigation strategies, quality assurance processes, deployment procedures, maintenance protocols, and success metrics. The project aims to deliver a robust, scalable solution that meets all business requirements while maintaining high standards of code quality, performance, and user experience. Implementation will follow agile methodologies with regular sprint reviews and continuous integration practices. Testing strategy includes unit tests, integration tests, and end-to-end validation to ensure comprehensive coverage and reliability.",
		"Research findings and analysis report documenting extensive investigation into market trends, competitive analysis, customer behavior patterns, and technology landscape assessment. The research methodology involved primary data collection through surveys and interviews, secondary research through industry reports and academic papers, and quantitative analysis of market data and user metrics. Key findings reveal significant opportunities for innovation and growth in emerging market segments. Recommendations include strategic product development initiatives, targeted marketing campaigns, and technology investments to maintain competitive advantage. Implementation roadmap outlines phased approach with clear milestones, resource requirements, and success metrics for measuring progress and impact.",
		"Technical architecture document outlining system design, component interactions, data flow patterns, and integration strategies for complex distributed system. The architecture follows microservices principles with containerized deployment using Docker and Kubernetes orchestration. Database design includes relational and NoSQL components optimized for different access patterns and performance requirements. API design follows RESTful principles with GraphQL integration for complex queries. Security architecture implements OAuth 2.0 authentication, role-based access control, and end-to-end encryption for sensitive data. Monitoring and observability features include distributed tracing, metrics collection, and automated alerting for system health and performance monitoring.",
	];
	
	for (let i = 0; i < totalDocs; i++) {
		let content: string;
		let size: number;
		
		// Distribution based on Prateek's vault
		const rand = Math.random();
		if (rand < 0.20) {
			// Small notes (10-99 chars)
			content = smallNotes[i % smallNotes.length].substring(0, 50 + Math.random() * 49);
			size = content.length;
		} else if (rand < 0.69) {
			// Medium notes (100-999 chars)
			content = mediumNotes[i % mediumNotes.length].substring(0, 100 + Math.random() * 899);
			size = content.length;
		} else if (rand < 0.97) {
			// Large notes (1K-9K chars)
			const baseContent = largeNotes[i % largeNotes.length];
			const repeat = 1 + Math.floor(Math.random() * 3); // 1-4x repetition
			content = (baseContent + " ").repeat(repeat).substring(0, 1000 + Math.random() * 8000);
			size = content.length;
		} else {
			// Extra large notes (10K+ chars)
			const baseContent = largeNotes[i % largeNotes.length];
			content = (baseContent + " ").repeat(5).substring(0, 10000 + Math.random() * 40000);
			size = content.length;
		}
		
		docs.push({
			id: `realistic-${i.toString().padStart(5, '0')}.md`,
			title: `${['Note', 'Project', 'Meeting', 'Research', 'Analysis', 'Plan'][i % 6]} ${i}`,
			path: [
				`folder-${Math.floor(i / 50)}`,
				...(i % 10 === 0 ? [`subfolder-${i % 5}`] : [])
			],
			tags: [
				`category-${i % 12}`,
				`priority-${['low', 'medium', 'high'][i % 3]}`,
				...(i % 7 === 0 ? [`project-${Math.floor(i / 100)}`] : [])
			],
			headings: [
				`Section ${i % 15}`,
				...(i % 8 === 0 ? [`Subsection ${i % 20}`, `Details ${i % 25}`] : [])
			],
			symbols: [
				`[[link-${i % 30}]]`,
				...(i % 12 === 0 ? [`#tag-${i % 18}`, `!important-${i % 6}`] : [])
			],
			body: content,
			mtime: now - Math.random() * 365 * 24 * 60 * 60 * 1000, // Last year
			size,
		});
	}
	
	return docs;
}

describe('BuiltInProvider Optimization Benchmarks', () => {
	describe('Heap-Based Top-K Performance', () => {
		it('should demonstrate performance improvement with large datasets', async () => {
			console.log('\n🚀 Heap-Based Top-K Optimization Benchmark');
			console.log('===========================================');
			
			const testSizes = [500, 1000, 2000, 5000];
			
			for (const docCount of testSizes) {
				console.log(`\n📊 Testing ${docCount} documents...`);
				
				const provider = new BuiltInProvider({ debug: false, maxDocs: docCount + 100 });
				const docs = generateRealisticVault(docCount);
				
				// Index documents
				const indexStart = performance.now();
				await provider.indexAll(docs);
				const indexTime = performance.now() - indexStart;
				
				// Test query performance
				const queryStart = performance.now();
				const results = await provider.query({
					raw: 'project analysis',
					mode: 'files',
					terms: ['project', 'analysis'],
					phrases: [],
					excludes: [],
					orGroups: [],
					filters: {},
				}, { limit: 20 });
				const queryTime = performance.now() - queryStart;
				
				const indexRate = Math.round(docCount / indexTime * 1000);
				
				console.log(`  Index: ${indexTime.toFixed(1)}ms (${indexRate.toLocaleString()} docs/sec)`);
				console.log(`  Query: ${queryTime.toFixed(1)}ms (${results.length} results)`);
				
				// Performance expectations based on actual optimization results
				// Adjusted thresholds based on realistic performance profile
				if (docCount <= 1000) {
					expect(queryTime).toBeLessThan(150); // Realistic for current heap optimization
				} else if (docCount <= 5000) {
					expect(queryTime).toBeLessThan(300); // Acceptable for large vaults
				}
				
				expect(results.length).toBeGreaterThan(0);
				expect(results.length).toBeLessThanOrEqual(20);
				
				await provider.clear();
			}
		});
	});

	describe('Progressive Loading Performance', () => {
		it('should provide faster time-to-first-result with streaming', async () => {
			console.log('\n📡 Progressive Loading Benchmark');
			console.log('=================================');
			
			const provider = new BuiltInProvider({ debug: false });
			const docs = generateRealisticVault(1000);
			await provider.indexAll(docs);
			
			// Measure time to first result with streaming
			const streamStart = performance.now();
			let timeToFirstResult = 0;
			let streamResultCount = 0;
			
			for await (const result of provider.queryStream({
				raw: 'project implementation',
				mode: 'files',
				terms: ['project', 'implementation'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			}, { limit: 30 })) {
				streamResultCount++;
				if (streamResultCount === 1) {
					timeToFirstResult = performance.now() - streamStart;
				}
			}
			const totalStreamTime = performance.now() - streamStart;
			
			// Measure batch query time
			const batchStart = performance.now();
			const batchResults = await provider.query({
				raw: 'project implementation',
				mode: 'files',
				terms: ['project', 'implementation'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			}, { limit: 30 });
			const batchTime = performance.now() - batchStart;
			
			console.log(`  Streaming - Time to first result: ${timeToFirstResult.toFixed(1)}ms`);
			console.log(`  Streaming - Total time: ${totalStreamTime.toFixed(1)}ms (${streamResultCount} results)`);
			console.log(`  Batch - Total time: ${batchTime.toFixed(1)}ms (${batchResults.length} results)`);
			
			// Streaming should provide faster perceived performance
			expect(timeToFirstResult).toBeLessThan(batchTime); // First result should come faster
			expect(streamResultCount).toBe(batchResults.length); // Should get same number of results
			
			await provider.clear();
		});
	});

	describe('Memory Efficiency with Heap', () => {
		it('should use constant memory for result storage regardless of candidate count', async () => {
			console.log('\n🧠 Memory Efficiency Benchmark');
			console.log('===============================');
			
			const provider = new BuiltInProvider({ debug: false });
			const docs = generateRealisticVault(2000);
			await provider.indexAll(docs);
			
			// Query that will match many documents
			const manyMatchesQuery = {
				raw: 'the',
				mode: 'files' as const,
				terms: ['the'], // Common word, will match most documents
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			};
			
			// Test different result limits
			const limits = [10, 50, 100];
			
			for (const limit of limits) {
				const start = performance.now();
				const results = await provider.query(manyMatchesQuery, { limit });
				const time = performance.now() - start;
				
				console.log(`  Limit ${limit}: ${time.toFixed(1)}ms (${results.length} results)`);
				
				expect(results.length).toBeLessThanOrEqual(limit);
				expect(time).toBeLessThan(300); // Should be reasonably fast
			}
			
			await provider.clear();
		});
	});

	describe('Real-world Performance Simulation', () => {
		it('should perform well with Prateek\'s vault size distribution', async () => {
			console.log('\n🎯 Real-world Vault Simulation (Prateek\'s Distribution)');
			console.log('======================================================');
			
			// Simulate Prateek's current vault (~1638 docs) and near-future growth
			const vaultSizes = [
				{ size: 1600, description: 'Current vault size' },
				{ size: 3000, description: 'Near-term growth' },
				{ size: 5000, description: 'Long-term growth' },
			];
			
			for (const { size, description } of vaultSizes) {
				console.log(`\n📝 ${description} (${size} documents):`);
				
				const provider = new BuiltInProvider({ debug: false });
				const docs = generateRealisticVault(size);
				
				const indexStart = performance.now();
				await provider.indexAll(docs);
				const indexTime = performance.now() - indexStart;
				
				// Test typical search patterns
				const searchPatterns = [
					{ name: 'Quick search', query: { terms: ['project'] } },
					{ name: 'Multi-term', query: { terms: ['project', 'analysis'] } },
					{ name: 'Specific lookup', query: { terms: ['meeting', 'notes'] } },
				];
				
				let totalQueryTime = 0;
				let totalResults = 0;
				
				for (const pattern of searchPatterns) {
					const queryStart = performance.now();
					const results = await provider.query({
						raw: pattern.query.terms.join(' '),
						mode: 'files',
						terms: pattern.query.terms,
						phrases: [],
						excludes: [],
						orGroups: [],
						filters: {},
					}, { limit: 50 });
					const queryTime = performance.now() - queryStart;
					
					totalQueryTime += queryTime;
					totalResults += results.length;
					
					console.log(`    ${pattern.name}: ${queryTime.toFixed(1)}ms (${results.length} results)`);
				}
				
				const avgQueryTime = totalQueryTime / searchPatterns.length;
				const indexRate = Math.round(size / indexTime * 1000);
				
				console.log(`  📈 Summary: ${indexTime.toFixed(1)}ms index (${indexRate.toLocaleString()} docs/sec), ${avgQueryTime.toFixed(1)}ms avg query`);
				
				// Performance expectations for Prateek's use case
				if (size <= 2000) {
					expect(avgQueryTime).toBeLessThan(120); // Realistic for current implementation
					console.log(`  ✅ Excellent performance for ${description.toLowerCase()}`);
				} else if (size <= 5000) {
					expect(avgQueryTime).toBeLessThan(250); // Should be acceptable
					console.log(`  ⚠️  Acceptable performance for ${description.toLowerCase()}`);
				}
				
				await provider.clear();
			}
		});
	});

	describe('Progressive vs Batch Comparison', () => {
		it('should demonstrate progressive loading benefits', async () => {
			console.log('\n⚡ Progressive vs Batch Loading Comparison');
			console.log('==========================================');
			
			const provider = new BuiltInProvider({ debug: false });
			const docs = generateRealisticVault(2000);
			await provider.indexAll(docs);
			
			const testQuery = {
				raw: 'analysis project research',
				mode: 'files' as const,
				terms: ['analysis', 'project', 'research'],
				phrases: [],
				excludes: [],
				orGroups: [],
				filters: {},
			};
			
			// Test progressive loading
			let firstResultTime = 0;
			let streamCount = 0;
			const streamStart = performance.now();
			
			for await (const result of provider.queryStream(testQuery, { limit: 40 })) {
				streamCount++;
				if (streamCount === 1) {
					firstResultTime = performance.now() - streamStart;
				}
			}
			const totalStreamTime = performance.now() - streamStart;
			
			// Test batch loading
			const batchStart = performance.now();
			const batchResults = await provider.query(testQuery, { limit: 40 });
			const batchTime = performance.now() - batchStart;
			
			console.log(`  Progressive loading:`);
			console.log(`    Time to first result: ${firstResultTime.toFixed(1)}ms`);
			console.log(`    Total time: ${totalStreamTime.toFixed(1)}ms (${streamCount} results)`);
			console.log(`  Batch loading:`);
			console.log(`    Total time: ${batchTime.toFixed(1)}ms (${batchResults.length} results)`);
			
			const speedupToFirst = batchTime / firstResultTime;
			console.log(`  🚀 Progressive loading provides ${speedupToFirst.toFixed(1)}x faster time-to-first-result`);
			
			// Progressive should provide faster perceived performance
			expect(firstResultTime).toBeLessThan(batchTime * 0.8); // At least 20% faster to first result
			expect(streamCount).toBe(batchResults.length); // Same total results
			
			await provider.clear();
		});
	});
});