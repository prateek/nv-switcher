// ABOUTME: Core vault indexer that extracts documents from TFiles with incremental updates
// ABOUTME: Handles file events, persistence, and lazy body extraction for search provider

import { App, TFile, CachedMetadata, FileStats, Platform } from 'obsidian';
import { Doc } from '../search/types';

/**
 * Interface for search provider integration
 */
export interface SearchProvider {
	upsert(file: TFile, doc: Doc): Promise<void>;
	remove(file: TFile): Promise<void>;
}

/**
 * Settings subset needed for indexing
 */
export interface IndexerSettings {
	general: {
		includeCodeBlocks: boolean;
	};
	search: {
		excludeFolders: string[];
	};
}

/**
 * File cache entry for persistence
 */
interface FileCacheEntry {
	mtime: number;
	size: number;
}

/**
 * Options for document extraction
 */
interface ExtractionOptions {
	includeBody?: boolean;
}

/**
 * Queued indexing task
 */
interface IndexingTask {
	file: TFile;
	priority: number; // Higher priority = process first
}

/**
 * VaultIndex manages document extraction and incremental updates
 */
export class VaultIndex {
	private app: App;
	private provider: SearchProvider;
	private settings: IndexerSettings;
	private fileCache = new Map<string, FileCacheEntry>();
	
	// Lazy body indexing queue
	private bodyQueue: IndexingTask[] = [];
	private isProcessingQueue = false;
	private queueProcessor?: number;
	
	// Performance tuning
	private readonly MAX_CONCURRENT_TASKS = Platform.isMobile ? 2 : 4;
	private readonly QUEUE_BATCH_SIZE = Platform.isMobile ? 5 : 10;
	private readonly QUEUE_DELAY_MS = Platform.isMobile ? 100 : 50;
	
	constructor(app: App, provider: SearchProvider, settings: IndexerSettings) {
		this.app = app;
		this.provider = provider;
		this.settings = settings;
	}

	/**
	 * Load cached file metadata from persistence
	 */
	async loadCache(data: any): Promise<void> {
		if (data?.fileCache) {
			this.fileCache = new Map(Object.entries(data.fileCache));
		}
	}

	/**
	 * Save cached file metadata for persistence
	 */
	getCache(): Record<string, FileCacheEntry> {
		return Object.fromEntries(this.fileCache);
	}

	/**
	 * Index all files in the vault
	 */
	async indexAll(files: TFile[]): Promise<Doc[]> {
		const docs: Doc[] = [];
		
		// First pass: Extract metadata quickly (no body content)
		const metaTasks = files.map(file => async () => {
			if (this.shouldSkipFile(file)) return null;
			
			try {
				const doc = await this.extractDoc(file, { includeBody: false });
				await this.provider.upsert(file, doc);
				docs.push(doc);
				
				// Queue for body extraction
				this.queueBodyExtraction(file, 1); // Normal priority
				
				return doc;
			} catch (error) {
				console.warn(`Failed to index file ${file.path}:`, error);
				return null;
			}
		});

		// Process metadata extraction in batches
		await this.processBatch(metaTasks);
		
		// Start processing body queue
		this.startQueueProcessor();
		
		return docs;
	}

	/**
	 * Update or insert a single file
	 */
	async upsert(file: TFile): Promise<Doc> {
		if (this.shouldSkipFile(file)) {
			throw new Error(`File ${file.path} should be skipped`);
		}

		const doc = await this.extractDoc(file, { includeBody: true });
		await this.provider.upsert(file, doc);
		
		// Update cache
		this.updateFileCache(file);
		
		return doc;
	}

	/**
	 * Update or insert a single file only if it has changed
	 */
	async upsertIfChanged(file: TFile): Promise<Doc | null> {
		if (this.shouldSkipFile(file)) {
			throw new Error(`File ${file.path} should be skipped`);
		}

		// Check if file has changed
		if (!this.hasFileChanged(file)) {
			// File unchanged, return null to indicate no update needed
			return null;
		}

		return await this.upsert(file);
	}

	/**
	 * Remove a file from the index
	 */
	async remove(file: TFile): Promise<void> {
		await this.provider.remove(file);
		this.fileCache.delete(file.path);
	}

	/**
	 * Handle file rename
	 */
	async rename(file: TFile, oldPath: string): Promise<void> {
		// Remove old cache entry
		this.fileCache.delete(oldPath);
		
		// Re-index with new path
		await this.upsert(file);
	}

	/**
	 * Extract document data from a TFile
	 */
	async extractDoc(file: TFile, options: ExtractionOptions = {}): Promise<Doc> {
		const cache = this.app.metadataCache.getFileCache(file);
		const stats = file.stat;
		
		// Extract basic metadata
		const title = file.basename;
		const pathTokens = file.parent?.path ? 
			file.parent.path.split('/').filter(Boolean) : [];
		
		// Extract tags, headings, and symbols from cache
		const tags = this.extractTags(cache);
		const headings = this.extractHeadings(cache);
		const symbols = await this.extractSymbols(file, cache);
		
		// Extract body if requested
		let body = '';
		if (options.includeBody) {
			body = await this.extractBody(file);
		}

		const doc: Doc = {
			id: file.path,
			title,
			path: pathTokens,
			tags,
			headings,
			symbols,
			body,
			mtime: stats.mtime,
			size: stats.size,
		};

		return doc;
	}

	/**
	 * Check if file should be skipped based on settings
	 */
	private shouldSkipFile(file: TFile): boolean {
		// Skip non-markdown files
		if (file.extension !== 'md') {
			return true;
		}

		// Check excluded folders
		for (const excludedFolder of this.settings.search.excludeFolders) {
			if (file.path.startsWith(excludedFolder + '/') || file.path === excludedFolder) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if file has changed since last indexing
	 */
	private hasFileChanged(file: TFile): boolean {
		const cached = this.fileCache.get(file.path);
		if (!cached) return true;
		
		const stats = file.stat;
		return cached.mtime !== stats.mtime || cached.size !== stats.size;
	}

	/**
	 * Update file cache entry
	 */
	private updateFileCache(file: TFile): void {
		const stats = file.stat;
		this.fileCache.set(file.path, {
			mtime: stats.mtime,
			size: stats.size,
		});
	}

	/**
	 * Extract tags from frontmatter and inline tags
	 */
	private extractTags(cache: CachedMetadata | null): string[] {
		const tags = new Set<string>();

		// Extract from cache.tags (inline tags)
		if (cache?.tags) {
			for (const tag of cache.tags) {
				tags.add(tag.tag.replace('#', ''));
			}
		}

		// Extract from frontmatter
		if (cache?.frontmatter?.tags) {
			const fmTags = cache.frontmatter.tags;
			if (Array.isArray(fmTags)) {
				for (const tag of fmTags) {
					if (typeof tag === 'string') {
						tags.add(tag.replace('#', ''));
					}
				}
			} else if (typeof fmTags === 'string') {
				tags.add(fmTags.replace('#', ''));
			}
		}

		return Array.from(tags);
	}

	/**
	 * Extract headings from cache
	 */
	private extractHeadings(cache: CachedMetadata | null): string[] {
		if (!cache?.headings) return [];
		
		return cache.headings.map(h => h.heading);
	}

	/**
	 * Extract symbols (links, block refs, code labels) from cache and body
	 */
	private async extractSymbols(file: TFile, cache: CachedMetadata | null): Promise<string[]> {
		const symbols = new Set<string>();

		// Extract links from cache
		if (cache?.links) {
			for (const link of cache.links) {
				symbols.add(link.link);
			}
		}

		// Extract block references and code labels from body
		try {
			const content = await this.app.vault.read(file);
			
			// Block references: ^identifier
			const blockRefs = content.matchAll(/\^[A-Za-z0-9\-_/]+/g);
			for (const match of blockRefs) {
				symbols.add(match[0]);
			}

			// Code block labels: ```language
			const codeLabels = content.matchAll(/```(\S+)/g);
			for (const match of codeLabels) {
				symbols.add(match[1]);
			}
		} catch (error) {
			console.warn(`Failed to extract symbols from ${file.path}:`, error);
		}

		return Array.from(symbols);
	}

	/**
	 * Extract and normalize body text
	 */
	private async extractBody(file: TFile): Promise<string> {
		try {
			let content = await this.app.vault.read(file);
			
			// Strip code blocks if not including them
			if (!this.settings.general.includeCodeBlocks) {
				content = content.replace(/```[\s\S]*?```/g, '');
			}

			// Normalize to lowercase for search
			return content.toLowerCase();
		} catch (error) {
			console.warn(`Failed to read body from ${file.path}:`, error);
			return '';
		}
	}

	/**
	 * Queue a file for body extraction
	 */
	private queueBodyExtraction(file: TFile, priority: number): void {
		this.bodyQueue.push({ file, priority });
		
		// Sort by priority (higher priority first)
		this.bodyQueue.sort((a, b) => b.priority - a.priority);
	}

	/**
	 * Start processing the body extraction queue
	 */
	private startQueueProcessor(): void {
		if (this.isProcessingQueue) return;
		
		this.isProcessingQueue = true;
		this.processQueue();
	}

	/**
	 * Process queued body extractions
	 */
	private async processQueue(): Promise<void> {
		while (this.bodyQueue.length > 0) {
			const batch = this.bodyQueue.splice(0, this.QUEUE_BATCH_SIZE);
			
			const tasks = batch.map(task => async () => {
				try {
					const doc = await this.extractDoc(task.file, { includeBody: true });
					await this.provider.upsert(task.file, doc);
					this.updateFileCache(task.file);
				} catch (error) {
					console.warn(`Failed to process body for ${task.file.path}:`, error);
				}
			});

			await this.processBatch(tasks);
			
			// Yield control to prevent blocking
			await this.delay(this.QUEUE_DELAY_MS);
		}
		
		this.isProcessingQueue = false;
	}

	/**
	 * Process tasks in batches with concurrency control
	 */
	private async processBatch(tasks: Array<() => Promise<any>>): Promise<void> {
		for (let i = 0; i < tasks.length; i += this.MAX_CONCURRENT_TASKS) {
			const batch = tasks.slice(i, i + this.MAX_CONCURRENT_TASKS);
			await Promise.all(batch.map(task => task()));
		}
	}

	/**
	 * Utility delay function
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		if (this.queueProcessor) {
			clearTimeout(this.queueProcessor);
		}
		this.bodyQueue = [];
		this.isProcessingQueue = false;
	}
}