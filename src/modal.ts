// ABOUTME: Complete nvALT-like modal interface with search, commands, and preview functionality
// ABOUTME: Provides real-time file search, commands palette, and multi-fragment preview with keyboard navigation

import { App, Modal, TFile, Command } from 'obsidian';
import { HotkeyManager } from './hotkey-manager';
import type NvSwitcherPlugin from './plugin';
import { SearchResult, MatchSpan } from './search/types';

export class NvModal extends Modal {
	plugin: NvSwitcherPlugin;
	hotkeyManager: HotkeyManager | null = null;
	
	// UI Elements
	private inputEl!: HTMLInputElement;
	private resultsEl!: HTMLElement;
	private previewEl!: HTMLElement;
	private statusEl!: HTMLElement;
	
	// State
	private currentQuery = '';
	private results: SearchResult[] = [];
	private selectedIndex = 0;
	private isCommandsMode = false;
	private commands: Command[] = [];
	private currentFragmentIndex = 0;
	private fragments: PreviewFragment[] = [];
	private isPreviewFocused = false;
	
	// Async operations
	private searchAbortController: AbortController | null = null;
	private searchTimeoutId: number | null = null;

	constructor(app: App, plugin: NvSwitcherPlugin) {
		super(app);
		this.plugin = plugin;
		this.hotkeyManager = plugin.getHotkeyManager();
		
		// Set up modal properties
		this.modalEl.addClass('nv-switcher-modal');
		this.contentEl.addClass('nv-switcher-content');
	}

	onOpen() {
		this.buildModalUI();
		this.setupKeyboardHandlers();
		this.showRecentFiles();
		
		// Focus input immediately
		this.inputEl.focus();
	}

	onClose() {
		this.cleanup();
		this.contentEl.empty();
	}

	private buildModalUI() {
		// Create main container with three sections
		const container = this.contentEl.createDiv('nv-modal-container');
		
		// Input section
		const inputContainer = container.createDiv('nv-input-container');
		this.inputEl = inputContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search files or type > for commands...',
			cls: 'nv-input'
		});
		
		this.statusEl = inputContainer.createDiv('nv-status');
		
		// Results section
		this.resultsEl = container.createDiv('nv-results');
		this.resultsEl.setAttribute('role', 'listbox');
		this.resultsEl.setAttribute('aria-label', 'Search results');
		
		// Preview section
		this.previewEl = container.createDiv('nv-preview');
		this.previewEl.setAttribute('tabindex', '-1');
		
		// Bind input events
		this.inputEl.addEventListener('input', this.handleInput.bind(this));
		this.inputEl.addEventListener('keydown', this.handleInputKeydown.bind(this));
	}

	private handleInput() {
		const query = this.inputEl.value;
		this.currentQuery = query;
		
		// Cancel previous search
		if (this.searchAbortController) {
			this.searchAbortController.abort();
		}
		
		if (this.searchTimeoutId) {
			window.clearTimeout(this.searchTimeoutId);
		}
		
		// Debounce search
		this.searchTimeoutId = window.setTimeout(() => {
			this.performSearch(query);
		}, 100);
	}

	private async performSearch(query: string) {
		try {
			this.isCommandsMode = query.startsWith('>');
			
			if (this.isCommandsMode) {
				await this.searchCommands(query.slice(1).trim());
			} else if (query.trim() === '') {
				this.showRecentFiles();
			} else {
				await this.searchFiles(query);
			}
		} catch (error) {
			if (error instanceof Error && error.name !== 'AbortError') {
				this.showError('Search failed: ' + error.message);
			}
		}
	}

	private async searchFiles(query: string) {
		this.searchAbortController = new AbortController();
		
		try {
			const parsedQuery = this.plugin.getQueryParser().parseQuery(query, {
				enableRegex: true,
				enableFuzzy: true,
				fuzzyThreshold: 0.3
			});
			
			const provider = this.plugin.getSearchProvider();
			const searchResults = await provider.query(parsedQuery, {
				limit: 50,
				signal: this.searchAbortController.signal
			});
			
			this.results = searchResults;
			this.selectedIndex = 0;
			this.renderResults();
			this.updatePreview();
			
		} catch (error) {
			if (error instanceof Error && error.name !== 'AbortError') {
				throw error;
			}
		}
	}

	private async searchCommands(query: string) {
		// Get all registered commands from the app
		const allCommands = Object.values((this.app as any).commands.commands || {}) as Command[];
		this.commands = allCommands
			.filter((cmd: Command) => 
				cmd.name.toLowerCase().includes(query.toLowerCase()) ||
				cmd.id.toLowerCase().includes(query.toLowerCase())
			)
			.slice(0, 20);
		
		this.renderCommandResults();
		this.previewEl.empty();
	}

	private showRecentFiles() {
		// Get recent files from vault, sorted by mtime
		const recentFiles = this.app.vault.getMarkdownFiles()
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, 10);
		
		// Convert to SearchResult format
		this.results = recentFiles.map(file => ({
			id: file.path,
			score: 1.0,
			matchSpans: []
		}));
		
		this.selectedIndex = 0;
		this.renderResults();
		this.updatePreview();
	}

	private renderResults() {
		this.resultsEl.empty();
		
		if (this.results.length === 0 && this.currentQuery.trim() !== '') {
			this.renderCreateOption();
			return;
		}
		
		this.results.forEach((result, index) => {
			const item = this.resultsEl.createDiv('nv-result-item');
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', (index === this.selectedIndex).toString());
			
			if (index === this.selectedIndex) {
				item.addClass('selected');
			}
			
			const file = this.app.vault.getFileByPath(result.id);
			if (!file) return;
			
			// Left side: title and snippet
			const leftSide = item.createDiv('nv-result-left');
			const title = leftSide.createDiv('nv-result-title');
			title.textContent = file.basename;
			
			const snippet = leftSide.createDiv('nv-result-snippet');
			this.renderSnippet(snippet, result);
			
			// Right side: mtime and path
			const rightSide = item.createDiv('nv-result-right');
			const mtime = rightSide.createDiv('nv-result-mtime');
			mtime.textContent = this.formatRelativeTime(file.stat.mtime);
			
			const path = rightSide.createDiv('nv-result-path');
			path.textContent = file.parent?.path || '';
			
			// Click handler
			item.addEventListener('click', () => {
				this.selectedIndex = index;
				this.updateSelection();
				this.handleOpen(false);
			});
		});
	}

	private renderCommandResults() {
		this.resultsEl.empty();
		
		this.commands.forEach((command, index) => {
			const item = this.resultsEl.createDiv('nv-result-item nv-command-item');
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', (index === this.selectedIndex).toString());
			
			if (index === this.selectedIndex) {
				item.addClass('selected');
			}
			
			const icon = item.createDiv('nv-command-icon');
			icon.textContent = '⌘';
			
			const content = item.createDiv('nv-command-content');
			const name = content.createDiv('nv-command-name');
			name.textContent = command.name;
			
			const id = content.createDiv('nv-command-id');
			id.textContent = command.id;
			
			item.addEventListener('click', () => {
				this.selectedIndex = index;
				this.executeCommand(command);
			});
		});
	}

	private renderCreateOption() {
		const item = this.resultsEl.createDiv('nv-result-item nv-create-item');
		item.setAttribute('role', 'option');
		item.setAttribute('aria-selected', 'true');
		item.addClass('selected');
		
		const icon = item.createDiv('nv-create-icon');
		icon.textContent = '✨';
		
		const content = item.createDiv('nv-create-content');
		content.textContent = `Create "${this.currentQuery}"`;
		
		item.addEventListener('click', () => {
			this.handleForceCreate();
		});
	}

	private renderSnippet(container: HTMLElement, result: SearchResult) {
		if (result.matchSpans.length === 0) {
			container.textContent = ''; // No snippet for non-search results
			return;
		}
		
		// Get file content and create snippet with highlights
		const file = this.app.vault.getFileByPath(result.id);
		if (!file) return;
		
		this.app.vault.cachedRead(file).then(content => {
			const fragment = this.extractSnippet(content, result.matchSpans);
			container.innerHTML = fragment;
		}).catch(() => {
			container.textContent = 'Could not load snippet';
		});
	}

	private extractSnippet(content: string, matchSpans: MatchSpan[]): string {
		if (matchSpans.length === 0) return '';
		
		// Find the best match span (usually the first body match)
		const bodySpan = matchSpans.find(span => span.field === 'body') || matchSpans[0];
		if (!bodySpan) return '';
		
		const start = Math.max(0, bodySpan.start - 60);
		const end = Math.min(content.length, bodySpan.end + 60);
		
		let snippet = content.slice(start, end);
		
		// Add highlights
		const relativeStart = bodySpan.start - start;
		const relativeEnd = bodySpan.end - start;
		
		snippet = snippet.slice(0, relativeStart) +
			'<mark>' + snippet.slice(relativeStart, relativeEnd) + '</mark>' +
			snippet.slice(relativeEnd);
		
		// Clean up whitespace
		snippet = snippet.replace(/\s+/g, ' ').trim();
		
		// Add ellipsis if truncated
		if (start > 0) snippet = '...' + snippet;
		if (end < content.length) snippet = snippet + '...';
		
		return snippet;
	}

	private async updatePreview() {
		if (this.isCommandsMode || this.results.length === 0) {
			this.previewEl.empty();
			return;
		}
		
		const selectedResult = this.results[this.selectedIndex];
		if (!selectedResult) return;
		
		const file = this.app.vault.getFileByPath(selectedResult.id);
		if (!file) return;
		
		try {
			const content = await this.app.vault.cachedRead(file);
			this.renderPreview(file, content, selectedResult.matchSpans);
		} catch (error) {
			this.previewEl.empty();
			this.previewEl.createDiv('nv-preview-error').textContent = 'Could not load preview';
		}
	}

	private renderPreview(file: TFile, content: string, matchSpans: MatchSpan[]) {
		this.previewEl.empty();
		
		// Header
		const header = this.previewEl.createDiv('nv-preview-header');
		const title = header.createDiv('nv-preview-title');
		title.textContent = file.basename;
		
		if (matchSpans.length > 0) {
			const nav = header.createDiv('nv-preview-nav');
			
			if (this.fragments.length > 1) {
				const prevBtn = nav.createEl('button', {
					cls: 'nv-nav-btn',
					attr: { 'aria-label': 'Previous fragment' }
				});
				prevBtn.textContent = '◀';
				prevBtn.addEventListener('click', () => this.handleCycleLeft());
				
				const indicator = nav.createSpan('nv-nav-indicator');
				indicator.textContent = `${this.currentFragmentIndex + 1} / ${this.fragments.length}`;
				
				const nextBtn = nav.createEl('button', {
					cls: 'nv-nav-btn',
					attr: { 'aria-label': 'Next fragment' }
				});
				nextBtn.textContent = '▶';
				nextBtn.addEventListener('click', () => this.handleCycleRight());
			}
		}
		
		// Content
		const contentEl = this.previewEl.createDiv('nv-preview-content');
		
		if (matchSpans.length === 0) {
			// Show beginning of file for non-search results
			const preview = content.slice(0, 500);
			contentEl.textContent = preview + (content.length > 500 ? '...' : '');
		} else {
			// Generate and show fragments
			this.generatePreviewFragments(content, matchSpans);
			if (this.fragments.length > 0) {
				this.renderCurrentFragment(contentEl);
			}
		}
	}

	private generatePreviewFragments(content: string, matchSpans: MatchSpan[]) {
		this.fragments = [];
		this.currentFragmentIndex = 0;
		
		// Group spans by proximity
		const bodySpans = matchSpans.filter(span => span.field === 'body');
		if (bodySpans.length === 0) return;
		
		// Sort spans by position
		bodySpans.sort((a, b) => a.start - b.start);
		
		// Create fragments (max 3-5)
		const maxFragments = 3;
		const fragmentSize = 200; // characters around each match
		
		for (let i = 0; i < Math.min(bodySpans.length, maxFragments); i++) {
			const span = bodySpans[i];
			if (!span) continue;
			
			const start = Math.max(0, span.start - fragmentSize / 2);
			const end = Math.min(content.length, span.end + fragmentSize / 2);
			
			const text = content.slice(start, end);
			const relativeStart = span.start - start;
			const relativeEnd = span.end - start;
			
			this.fragments.push({
				text,
				highlightStart: relativeStart,
				highlightEnd: relativeEnd,
				originalStart: start
			});
		}
	}

	private renderCurrentFragment(container: HTMLElement) {
		const fragment = this.fragments[this.currentFragmentIndex];
		if (!fragment) return;
		
		const text = fragment.text;
		const before = text.slice(0, fragment.highlightStart);
		const highlight = text.slice(fragment.highlightStart, fragment.highlightEnd);
		const after = text.slice(fragment.highlightEnd);
		
		container.createSpan().textContent = before;
		const mark = container.createEl('mark');
		mark.textContent = highlight;
		container.createSpan().textContent = after;
	}

	private formatRelativeTime(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);
		
		if (minutes < 1) return 'now';
		if (minutes < 60) return `${minutes}m`;
		if (hours < 24) return `${hours}h`;
		if (days < 30) return `${days}d`;
		
		return new Date(timestamp).toLocaleDateString();
	}

	private setupKeyboardHandlers() {
		this.modalEl.addEventListener('keydown', this.handleKeydown.bind(this));
	}

	private handleInputKeydown(evt: KeyboardEvent) {
		// Don't handle these keys in input - let them bubble to modal handler
		if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(evt.key)) {
			return;
		}
	}

	private handleKeydown(evt: KeyboardEvent) {
		if (!this.hotkeyManager) return;

		// Handle escape to close
		if (this.hotkeyManager.is('close', evt)) {
			evt.preventDefault();
			if (this.isPreviewFocused) {
				this.focusInput();
			} else {
				this.close();
			}
			return;
		}

		// Navigation
		if (this.hotkeyManager.is('moveUp', evt)) {
			evt.preventDefault();
			this.handleMoveUp();
			return;
		}

		if (this.hotkeyManager.is('moveDown', evt)) {
			evt.preventDefault();
			this.handleMoveDown();
			return;
		}

		// Actions
		if (this.hotkeyManager.is('open', evt)) {
			evt.preventDefault();
			this.handleOpen(false);
			return;
		}

		if (this.hotkeyManager.is('openInSplit', evt)) {
			evt.preventDefault();
			this.handleOpen(true);
			return;
		}

		if (this.hotkeyManager.is('forceCreate', evt)) {
			evt.preventDefault();
			this.handleForceCreate();
			return;
		}

		// Preview navigation
		if (this.hotkeyManager.is('focusPreview', evt)) {
			evt.preventDefault();
			this.handleFocusPreview();
			return;
		}

		if (this.hotkeyManager.is('cycleLeft', evt)) {
			evt.preventDefault();
			this.handleCycleLeft();
			return;
		}

		if (this.hotkeyManager.is('cycleRight', evt)) {
			evt.preventDefault();
			this.handleCycleRight();
			return;
		}
	}

	private handleMoveUp() {
		if (this.isCommandsMode) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
		} else {
			const maxIndex = this.results.length === 0 && this.currentQuery.trim() !== '' ? 0 : this.results.length - 1;
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
		}
		this.updateSelection();
	}

	private handleMoveDown() {
		if (this.isCommandsMode) {
			this.selectedIndex = Math.min(this.commands.length - 1, this.selectedIndex + 1);
		} else {
			const maxIndex = this.results.length === 0 && this.currentQuery.trim() !== '' ? 0 : this.results.length - 1;
			this.selectedIndex = Math.min(maxIndex, this.selectedIndex + 1);
		}
		this.updateSelection();
	}

	private updateSelection() {
		// Update visual selection
		const items = this.resultsEl.querySelectorAll('.nv-result-item');
		items.forEach((item, index) => {
			if (index === this.selectedIndex) {
				item.addClass('selected');
				item.setAttribute('aria-selected', 'true');
				item.scrollIntoView({ block: 'nearest' });
			} else {
				item.removeClass('selected');
				item.setAttribute('aria-selected', 'false');
			}
		});
		
		// Update preview
		if (!this.isCommandsMode) {
			this.updatePreview();
		}
	}

	private async handleOpen(inSplit: boolean) {
		if (this.isCommandsMode) {
			const command = this.commands[this.selectedIndex];
			if (command) {
				this.executeCommand(command, inSplit);
			}
			return;
		}
		
		if (this.results.length === 0 && this.currentQuery.trim() !== '') {
			// No results, create file
			await this.createFile(this.currentQuery);
		} else if (this.results.length > 0) {
			// Open selected file
			const result = this.results[this.selectedIndex];
			if (result) {
				const file = this.app.vault.getFileByPath(result.id);
				if (file) {
					await this.openFile(file, inSplit);
				}
			}
		}
		
		this.close();
	}

	private async handleForceCreate() {
		if (this.currentQuery.trim() === '') return;
		
		await this.createFile(this.currentQuery);
		this.close();
	}

	private handleFocusPreview() {
		this.isPreviewFocused = !this.isPreviewFocused;
		if (this.isPreviewFocused) {
			this.previewEl.focus();
		} else {
			this.inputEl.focus();
		}
	}

	private handleCycleLeft() {
		if (this.fragments.length <= 1) return;
		this.currentFragmentIndex = (this.currentFragmentIndex - 1 + this.fragments.length) % this.fragments.length;
		this.updatePreview();
	}

	private handleCycleRight() {
		if (this.fragments.length <= 1) return;
		this.currentFragmentIndex = (this.currentFragmentIndex + 1) % this.fragments.length;
		this.updatePreview();
	}

	private focusInput() {
		this.isPreviewFocused = false;
		this.inputEl.focus();
	}

	private executeCommand(command: Command, inSplit = false) {
		try {
			// If command supports opening in split and mod+Enter was used
			if (inSplit && command.id.includes('open')) {
				// Try to execute with split context if possible
				// Most commands don't support this, so we'll just execute normally
			}
			
			(this.app as any).commands.executeCommandById(command.id);
		} catch (error) {
			this.showError('Failed to execute command: ' + command.name);
		}
		this.close();
	}

	private async createFile(name: string) {
		try {
			// Parse potential path
			const pathParts = name.split('/');
			const fileName = pathParts.pop() || name;
			const folderPath = pathParts.join('/');
			
			// Ensure folder exists
			if (folderPath) {
				await this.app.vault.adapter.mkdir(folderPath);
			}
			
			// Create full path
			let fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
			if (!fullPath.endsWith('.md')) {
				fullPath += '.md';
			}
			
			// Check if file already exists
			const existingFile = this.app.vault.getFileByPath(fullPath);
			if (existingFile) {
				// File exists, open it instead
				await this.openFile(existingFile, false);
				return;
			}
			
			// Create new file
			const file = await this.app.vault.create(fullPath, '');
			await this.openFile(file, false);
			
		} catch (error) {
			this.showError('Failed to create file: ' + (error as Error).message);
		}
	}

	private async openFile(file: TFile, inSplit: boolean) {
		try {
			const leaf = this.app.workspace.getLeaf(inSplit);
			await leaf.openFile(file);
		} catch (error) {
			this.showError('Failed to open file: ' + (error as Error).message);
		}
	}

	private showError(message: string) {
		this.statusEl.empty();
		this.statusEl.createDiv('nv-error').textContent = message;
		
		// Clear error after 3 seconds
		setTimeout(() => {
			this.statusEl.empty();
		}, 3000);
	}

	private cleanup() {
		// Cancel ongoing operations
		if (this.searchAbortController) {
			this.searchAbortController.abort();
		}
		
		if (this.searchTimeoutId) {
			window.clearTimeout(this.searchTimeoutId);
		}
		
		// Reset state
		this.currentQuery = '';
		this.results = [];
		this.selectedIndex = 0;
		this.isCommandsMode = false;
		this.commands = [];
		this.currentFragmentIndex = 0;
		this.fragments = [];
		this.isPreviewFocused = false;
		
		// Remove event listeners
		this.modalEl.removeEventListener('keydown', this.handleKeydown.bind(this));
	}
}

// Helper interfaces
interface PreviewFragment {
	text: string;
	highlightStart: number;
	highlightEnd: number;
	originalStart: number;
}