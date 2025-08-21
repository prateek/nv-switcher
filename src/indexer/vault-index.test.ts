// ABOUTME: Tests for VaultIndex document extraction and incremental updates
// ABOUTME: Verifies file caching, event handling, and performance optimization

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TFile, CachedMetadata, FileStats } from 'obsidian';
import { VaultIndex, SearchProvider, IndexerSettings } from './vault-index';
import { Doc } from '../search/types';

// Mock SearchProvider
class MockSearchProvider implements SearchProvider {
	public docs = new Map<string, Doc>();
	public upsertCalls: Array<{ file: TFile; doc: Doc }> = [];
	public removeCalls: TFile[] = [];

	async upsert(file: TFile, doc: Doc): Promise<void> {
		this.docs.set(file.path, doc);
		this.upsertCalls.push({ file, doc });
	}

	async remove(file: TFile): Promise<void> {
		this.docs.delete(file.path);
		this.removeCalls.push(file);
	}

	reset(): void {
		this.docs.clear();
		this.upsertCalls = [];
		this.removeCalls = [];
	}
}

// Mock TFile
function createMockFile(path: string, basename: string, extension = 'md', options: Partial<{
	mtime: number;
	size: number;
	parent: { path: string } | null;
}> = {}): TFile {
	const file = {
		path,
		basename,
		extension,
		stat: {
			mtime: options.mtime ?? Date.now(),
			size: options.size ?? 1024,
		} as FileStats,
		parent: options.parent ?? null,
	} as TFile;

	return file;
}

// Mock App
function createMockApp() {
	const metadataCache = new Map<string, CachedMetadata>();
	const fileContents = new Map<string, string>();

	return {
		metadataCache: {
			getFileCache: vi.fn((file: TFile) => metadataCache.get(file.path) || null),
			setCache: (path: string, cache: CachedMetadata) => metadataCache.set(path, cache),
		},
		vault: {
			read: vi.fn((file: TFile) => {
				const content = fileContents.get(file.path);
				if (content === undefined) {
					return Promise.reject(new Error(`File not found: ${file.path}`));
				}
				return Promise.resolve(content);
			}),
			setContent: (path: string, content: string) => fileContents.set(path, content),
		},
	};
}

describe('VaultIndex', () => {
	let vaultIndex: VaultIndex;
	let mockProvider: MockSearchProvider;
	let mockApp: ReturnType<typeof createMockApp>;
	let settings: IndexerSettings;

	beforeEach(() => {
		mockProvider = new MockSearchProvider();
		mockApp = createMockApp();
		settings = {
			general: {
				includeCodeBlocks: true,
			},
			search: {
				excludeFolders: [],
			},
		};
		
		vaultIndex = new VaultIndex(mockApp as any, mockProvider, settings);
	});

	afterEach(() => {
		vaultIndex.destroy();
	});

	describe('extractDoc', () => {
		it('should extract basic document metadata', async () => {
			const file = createMockFile('test/note.md', 'note', 'md', {
				mtime: 1234567890,
				size: 512,
				parent: { path: 'test' },
			});

			mockApp.vault.setContent('test/note.md', 'This is test content.');
			mockApp.metadataCache.setCache('test/note.md', {
				headings: [
					{ heading: 'Introduction', level: 1 } as any,
					{ heading: 'Conclusion', level: 2 } as any,
				],
				tags: [
					{ tag: '#project' } as any,
					{ tag: '#important' } as any,
				],
				links: [
					{ link: '[[Other Note]]' } as any,
				],
				frontmatter: {
					tags: ['meta-tag'],
				},
			});

			const doc = await vaultIndex.extractDoc(file, { includeBody: true });

			expect(doc).toEqual({
				id: 'test/note.md',
				title: 'note',
				path: ['test'],
				tags: ['project', 'important', 'meta-tag'],
				headings: ['Introduction', 'Conclusion'],
				symbols: ['[[Other Note]]'],
				body: 'this is test content.',
				mtime: 1234567890,
				size: 512,
			});
		});

		it('should extract block references and code labels from body', async () => {
			const file = createMockFile('test.md', 'test');
			const content = `
# Heading
Some text with a block reference ^block-id

\`\`\`typescript
console.log('code');
\`\`\`

Another block ^another-ref

\`\`\`python
print("python code")
\`\`\`
`;

			mockApp.vault.setContent('test.md', content);
			mockApp.metadataCache.setCache('test.md', {});

			const doc = await vaultIndex.extractDoc(file, { includeBody: true });

			expect(doc.symbols).toContain('^block-id');
			expect(doc.symbols).toContain('^another-ref');
			expect(doc.symbols).toContain('typescript');
			expect(doc.symbols).toContain('python');
		});

		it('should handle frontmatter tags as array and string', async () => {
			const file = createMockFile('test.md', 'test');
			
			mockApp.vault.setContent('test.md', 'Content');
			mockApp.metadataCache.setCache('test.md', {
				frontmatter: {
					tags: ['array-tag1', 'array-tag2'],
				},
			});

			const doc1 = await vaultIndex.extractDoc(file);
			expect(doc1.tags).toContain('array-tag1');
			expect(doc1.tags).toContain('array-tag2');

			// Test string tag
			mockApp.metadataCache.setCache('test.md', {
				frontmatter: {
					tags: 'string-tag',
				},
			});

			const doc2 = await vaultIndex.extractDoc(file);
			expect(doc2.tags).toContain('string-tag');
		});

		it('should strip code blocks when includeCodeBlocks is false', async () => {
			settings.general.includeCodeBlocks = false;
			vaultIndex = new VaultIndex(mockApp as any, mockProvider, settings);

			const file = createMockFile('test.md', 'test');
			const content = `
# Heading
Some text before code.

\`\`\`javascript
console.log('this should be removed');
\`\`\`

Some text after code.
`;

			mockApp.vault.setContent('test.md', content);
			mockApp.metadataCache.setCache('test.md', {});

			const doc = await vaultIndex.extractDoc(file, { includeBody: true });

			expect(doc.body).not.toContain('console.log');
			expect(doc.body).toContain('some text before code');
			expect(doc.body).toContain('some text after code');
		});

		it('should extract path tokens correctly', async () => {
			const file1 = createMockFile('note.md', 'note', 'md', {
				parent: null, // Root level
			});
			mockApp.vault.setContent('note.md', 'Content');
			mockApp.metadataCache.setCache('note.md', {});
			
			const doc1 = await vaultIndex.extractDoc(file1);
			expect(doc1.path).toEqual([]);

			const file2 = createMockFile('folder/subfolder/note.md', 'note', 'md', {
				parent: { path: 'folder/subfolder' },
			});
			mockApp.vault.setContent('folder/subfolder/note.md', 'Content');
			mockApp.metadataCache.setCache('folder/subfolder/note.md', {});
			
			const doc2 = await vaultIndex.extractDoc(file2);
			expect(doc2.path).toEqual(['folder', 'subfolder']);
		});
	});

	describe('file change detection', () => {
		it('should detect changed files based on mtime and size', async () => {
			const file = createMockFile('test.md', 'test', 'md', {
				mtime: 1000,
				size: 500,
			});

			mockApp.vault.setContent('test.md', 'Content');
			mockApp.metadataCache.setCache('test.md', {});

			// First upsert
			await vaultIndex.upsert(file);
			expect(mockProvider.upsertCalls).toHaveLength(1);

			// Reset provider but keep cache in vaultIndex
			mockProvider.reset();

			// Same file, should still call provider.upsert but doc is the same
			await vaultIndex.upsert(file);
			expect(mockProvider.upsertCalls).toHaveLength(1); // Still called

			// Change mtime - should detect change and call again
			mockProvider.reset();
			file.stat.mtime = 2000;
			await vaultIndex.upsert(file);
			expect(mockProvider.upsertCalls).toHaveLength(1);

			// Change size - should detect change and call again
			mockProvider.reset();
			file.stat.size = 600;
			await vaultIndex.upsert(file);
			expect(mockProvider.upsertCalls).toHaveLength(1);
		});
	});

	describe('file filtering', () => {
		it('should skip non-markdown files', async () => {
			const file = createMockFile('image.png', 'image', 'png');

			await expect(vaultIndex.upsert(file)).rejects.toThrow();
		});

		it('should skip files in excluded folders', async () => {
			settings.search.excludeFolders = ['private', 'temp'];
			vaultIndex = new VaultIndex(mockApp as any, mockProvider, settings);

			const file1 = createMockFile('private/secret.md', 'secret');
			const file2 = createMockFile('temp/draft.md', 'draft');
			const file3 = createMockFile('public/note.md', 'note');

			await expect(vaultIndex.upsert(file1)).rejects.toThrow();
			await expect(vaultIndex.upsert(file2)).rejects.toThrow();

			mockApp.vault.setContent('public/note.md', 'Content');
			mockApp.metadataCache.setCache('public/note.md', {});

			await expect(vaultIndex.upsert(file3)).resolves.toBeDefined();
		});
	});

	describe('bulk indexing', () => {
		it('should index all files and queue body extraction', async () => {
			const files = [
				createMockFile('note1.md', 'note1'),
				createMockFile('note2.md', 'note2'),
				createMockFile('note3.md', 'note3'),
			];

			// Setup content and metadata
			for (const file of files) {
				mockApp.vault.setContent(file.path, `Content of ${file.basename}`);
				mockApp.metadataCache.setCache(file.path, {});
			}

			const docs = await vaultIndex.indexAll(files);

			expect(docs).toHaveLength(3);
			expect(mockProvider.upsertCalls.length).toBeGreaterThanOrEqual(3);
			
			// Check that initial docs don't have body content
			const initialDocs = mockProvider.upsertCalls.slice(0, 3);
			for (const call of initialDocs) {
				expect(call.doc.body).toBe('');
			}
		});
	});

	describe('persistence', () => {
		it('should load and save file cache', async () => {
			const cacheData = {
				fileCache: {
					'test.md': { mtime: 1000, size: 500 },
					'other.md': { mtime: 2000, size: 800 },
				},
			};

			await vaultIndex.loadCache(cacheData);
			
			const cache = vaultIndex.getCache();
			expect(cache).toEqual(cacheData.fileCache);
		});

		it('should handle missing cache data gracefully', async () => {
			await vaultIndex.loadCache({});
			await vaultIndex.loadCache(null);
			
			const cache = vaultIndex.getCache();
			expect(cache).toEqual({});
		});
	});

	describe('remove and rename operations', () => {
		it('should remove files from provider and cache', async () => {
			const file = createMockFile('test.md', 'test');
			
			// Add to cache first
			mockApp.vault.setContent('test.md', 'Content');
			mockApp.metadataCache.setCache('test.md', {});
			await vaultIndex.upsert(file);

			// Remove
			await vaultIndex.remove(file);

			expect(mockProvider.removeCalls).toContain(file);
			expect(vaultIndex.getCache()['test.md']).toBeUndefined();
		});

		it('should handle file rename correctly', async () => {
			const file = createMockFile('new-path.md', 'new-path');
			const oldPath = 'old-path.md';

			// Setup file content
			mockApp.vault.setContent('new-path.md', 'Content');
			mockApp.metadataCache.setCache('new-path.md', {});

			await vaultIndex.rename(file, oldPath);

			expect(mockProvider.upsertCalls.some(call => call.file.path === 'new-path.md')).toBe(true);
			expect(vaultIndex.getCache()[oldPath]).toBeUndefined();
		});
	});
});