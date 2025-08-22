// ABOUTME: Tests for synthetic data fixtures to ensure deterministic and realistic generation
// ABOUTME: Validates fixture sets produce consistent, well-formed documents for testing

import { describe, it, expect } from 'vitest';
import { generateSyntheticVault, FIXTURE_SETS, createCustomFixture } from './fixtures';

describe('Synthetic Data Fixtures', () => {
	describe('generateSyntheticVault', () => {
		it('should generate deterministic results with same seed', () => {
			const vault1 = generateSyntheticVault({ count: 50, seed: 12345 });
			const vault2 = generateSyntheticVault({ count: 50, seed: 12345 });
			
			expect(vault1).toEqual(vault2);
			expect(vault1.length).toBe(50);
		});

		it('should generate different results with different seeds', () => {
			const vault1 = generateSyntheticVault({ count: 10, seed: 11111 });
			const vault2 = generateSyntheticVault({ count: 10, seed: 22222 });
			
			expect(vault1).not.toEqual(vault2);
			expect(vault1.length).toBe(vault2.length);
		});

		it('should follow realistic size distribution', () => {
			const vault = generateSyntheticVault({ count: 1000, seed: 12345 });
			
			const sizes = vault.map(doc => doc.body.length);
			const small = sizes.filter(s => s < 100).length;
			const medium = sizes.filter(s => s >= 100 && s < 1000).length;
			const large = sizes.filter(s => s >= 1000).length;
			
			// Should roughly follow 20%/49%/31% distribution
			expect(small).toBeGreaterThan(100); // At least 10%
			expect(small).toBeLessThan(400);    // At most 40%
			expect(medium).toBeGreaterThan(300); // At least 30%
			expect(large).toBeGreaterThan(100);  // At least 10%
		});

		it('should include diacritics when requested', () => {
			const vault = generateSyntheticVault({ 
				count: 100, 
				seed: 12345, 
				includeDiacritics: true 
			});
			
			const hasUnicode = vault.some(doc => 
				/[àáäâèéëêìíïîòóöôùúüûñç]/.test(doc.body) ||
				/[àáäâèéëêìíïîòóöôùúüûñç]/.test(doc.title)
			);
			
			expect(hasUnicode).toBe(true);
		});

		it('should include regex content when requested', () => {
			const vault = generateSyntheticVault({ 
				count: 100, 
				seed: 12345, 
				includeRegexContent: true 
			});
			
			const hasRegexContent = vault.some(doc => 
				doc.body.includes('/') && doc.body.includes('[') ||
				doc.body.includes('function') ||
				doc.body.includes('SELECT')
			);
			
			expect(hasRegexContent).toBe(true);
		});

		it('should respect maxBodySize limit', () => {
			const vault = generateSyntheticVault({ 
				count: 100, 
				seed: 12345, 
				maxBodySize: 500 
			});
			
			vault.forEach(doc => {
				expect(doc.body.length).toBeLessThanOrEqual(500);
				expect(doc.size).toBe(doc.body.length);
			});
		});

		it('should generate realistic mtime distribution', () => {
			const vault = generateSyntheticVault({ 
				count: 100, 
				seed: 12345, 
				timeRangeDays: 30 
			});
			
			const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
			const thirtyDaysAgo = baseTime - (30 * 24 * 60 * 60 * 1000);
			
			vault.forEach(doc => {
				expect(doc.mtime).toBeGreaterThanOrEqual(thirtyDaysAgo);
				expect(doc.mtime).toBeLessThanOrEqual(baseTime);
			});
		});

		it('should generate valid document structure', () => {
			const vault = generateSyntheticVault({ count: 10, seed: 12345 });
			
			vault.forEach(doc => {
				expect(typeof doc.id).toBe('string');
				expect(doc.id.length).toBeGreaterThan(0);
				expect(typeof doc.title).toBe('string');
				expect(Array.isArray(doc.path)).toBe(true);
				expect(Array.isArray(doc.tags)).toBe(true);
				expect(Array.isArray(doc.headings)).toBe(true);
				expect(Array.isArray(doc.symbols)).toBe(true);
				expect(typeof doc.body).toBe('string');
				expect(typeof doc.mtime).toBe('number');
				expect(typeof doc.size).toBe('number');
				expect(doc.mtime).toBeGreaterThan(0);
				expect(doc.size).toBeGreaterThanOrEqual(0);
			});
		});
	});

	describe('FIXTURE_SETS', () => {
		it('should provide consistent smoke fixture', () => {
			const smoke1 = FIXTURE_SETS.smoke();
			const smoke2 = FIXTURE_SETS.smoke();
			
			expect(smoke1).toEqual(smoke2);
			expect(smoke1.length).toBe(10);
		});

		it('should provide fixtures of expected sizes', () => {
			expect(FIXTURE_SETS.smoke().length).toBe(10);
			expect(FIXTURE_SETS.development().length).toBe(100);
			expect(FIXTURE_SETS.realistic().length).toBe(1000);
			expect(FIXTURE_SETS.stress().length).toBe(5000);
			expect(FIXTURE_SETS.performance().length).toBe(10000);
			expect(FIXTURE_SETS.diacritics().length).toBe(200);
			expect(FIXTURE_SETS.regexStress().length).toBe(500);
		});

		it('should generate edge cases correctly', () => {
			const edgeCases = FIXTURE_SETS.edgeCases();
			
			expect(edgeCases.length).toBeGreaterThan(0);
			
			// Should include empty document
			const emptyDoc = edgeCases.find(doc => doc.body.length === 0);
			expect(emptyDoc).toBeDefined();
			
			// Should include Unicode document
			const unicodeDoc = edgeCases.find(doc => /[中文العربية]/.test(doc.title));
			expect(unicodeDoc).toBeDefined();
			
			// Should include very old document
			const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
			const oldDoc = edgeCases.find(doc => doc.mtime < baseTime - (2 * 365 * 24 * 60 * 60 * 1000));
			expect(oldDoc).toBeDefined();
		});
	});

	describe('createCustomFixture', () => {
		it('should create fixtures with custom patterns', () => {
			const custom = createCustomFixture({
				count: 5,
				seed: 99999,
				titlePatterns: ['Test {Number}'],
				tagPatterns: ['custom', 'test'],
				contentTemplates: ['This is test content {Number}'],
				folderStructure: [['Custom', 'Tests']]
			});
			
			expect(custom.length).toBe(5);
			
			custom.forEach(doc => {
				expect(doc.title).toMatch(/Test \d+/);
				expect(doc.tags.some(tag => ['custom', 'test'].includes(tag))).toBe(true);
				expect(doc.path).toEqual(['Custom', 'Tests']);
				expect(doc.body).toMatch(/This is test content/);
			});
		});

		it('should be deterministic with same seed', () => {
			const custom1 = createCustomFixture({ count: 3, seed: 11111 });
			const custom2 = createCustomFixture({ count: 3, seed: 11111 });
			
			expect(custom1).toEqual(custom2);
		});
	});

	describe('Performance and Scale', () => {
		it('should generate large vaults efficiently', () => {
			const start = performance.now();
			const vault = generateSyntheticVault({ count: 1000, seed: 12345 });
			const duration = performance.now() - start;
			
			expect(vault.length).toBe(1000);
			expect(duration).toBeLessThan(1000); // Should complete within 1 second
		});

		it('should handle maximum size without memory issues', () => {
			const start = performance.now();
			const vault = generateSyntheticVault({ 
				count: 10000, 
				seed: 12345, 
				maxBodySize: 1000 // Limit body size for memory efficiency
			});
			const duration = performance.now() - start;
			
			expect(vault.length).toBe(10000);
			expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
			
			// Verify memory efficiency
			const totalSize = vault.reduce((sum, doc) => sum + doc.body.length, 0);
			expect(totalSize).toBeLessThan(10000 * 1000); // Reasonable memory usage
		});
	});
});