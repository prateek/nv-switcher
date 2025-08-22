// ABOUTME: Handles vault file events for incremental indexing updates
// ABOUTME: Manages throttling and batching of rapid file changes

import { App, TFile, Plugin, Component } from 'obsidian';
import { VaultIndex } from './vault-index';

/**
 * Handles vault events for incremental indexing
 */
export class VaultEventHandler extends Component {
	private app: App;
	private plugin: Plugin;
	private vaultIndex: VaultIndex;
	
	// Throttling for rapid changes
	private pendingUpdates = new Set<string>();
	private updateTimer?: number;
	private readonly UPDATE_DELAY_MS = 500; // Wait 500ms after last change
	
	constructor(app: App, plugin: Plugin, vaultIndex: VaultIndex) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.vaultIndex = vaultIndex;
	}

	/**
	 * Register all vault event listeners
	 */
	enable(): void {
		// File events with proper type casting for Obsidian API
		this.registerEvent(
			this.app.vault.on('create', this.onFileCreate.bind(this) as any)
		);
		
		this.registerEvent(
			this.app.vault.on('modify', this.onFileModify.bind(this) as any)
		);
		
		this.registerEvent(
			this.app.vault.on('delete', this.onFileDelete.bind(this) as any)
		);
		
		this.registerEvent(
			this.app.vault.on('rename', this.onFileRename.bind(this) as any)
		);

		// Metadata cache events for when metadata parsing completes
		this.registerEvent(
			this.app.metadataCache.on('changed', this.onMetadataChanged.bind(this) as any)
		);
	}

	/**
	 * Handle file creation
	 */
	private async onFileCreate(file: TFile): Promise<void> {
		if (!file || typeof file.path !== 'string' || typeof file.basename !== 'string') return;
		
		try {
			await this.vaultIndex.upsert(file);
		} catch (error) {
			// File might be excluded or not processable
			console.debug(`Skipped indexing new file ${file.path}:`, error);
		}
	}

	/**
	 * Handle file modification - throttle rapid changes
	 */
	private onFileModify(file: TFile): void {
		if (!file || typeof file.path !== 'string') return;
		
		// Add to pending updates
		this.pendingUpdates.add(file.path);
		
		// Reset the timer
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}
		
		this.updateTimer = window.setTimeout(() => {
			this.processPendingUpdates();
		}, this.UPDATE_DELAY_MS);
	}

	/**
	 * Handle file deletion
	 */
	private async onFileDelete(file: TFile): Promise<void> {
		if (!file || typeof file.path !== 'string') return;
		
		// Remove from pending updates if present
		this.pendingUpdates.delete(file.path);
		
		try {
			await this.vaultIndex.remove(file);
		} catch (error) {
			console.warn(`Failed to remove file from index ${file.path}:`, error);
		}
	}

	/**
	 * Handle file rename
	 */
	private async onFileRename(file: TFile, oldPath: string): Promise<void> {
		if (!file || typeof file.path !== 'string') return;
		
		// Update pending updates
		this.pendingUpdates.delete(oldPath);
		this.pendingUpdates.add(file.path);
		
		try {
			await this.vaultIndex.rename(file, oldPath);
		} catch (error) {
			console.warn(`Failed to handle file rename ${oldPath} -> ${file.path}:`, error);
		}
	}

	/**
	 * Handle metadata cache changes
	 */
	private onMetadataChanged(file: TFile): void {
		if (!file || typeof file.path !== 'string') return;
		
		// Metadata changed, trigger an update
		this.onFileModify(file);
	}

	/**
	 * Process all pending file updates
	 */
	private async processPendingUpdates(): Promise<void> {
		const paths = Array.from(this.pendingUpdates);
		this.pendingUpdates.clear();
		
		// Process updates in parallel
		const updatePromises = paths.map(async (path) => {
			const file = this.app.vault.getFileByPath(path);
			if (file && typeof file.path === 'string' && typeof file.basename === 'string') {
				try {
					await this.vaultIndex.upsert(file);
				} catch (error) {
					console.debug(`Skipped updating file ${path}:`, error);
				}
			}
		});

		await Promise.allSettled(updatePromises);
	}

	/**
	 * Cleanup resources
	 */
	onunload(): void {
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}
		this.pendingUpdates.clear();
		// Call parent cleanup
		super.onunload();
	}
}