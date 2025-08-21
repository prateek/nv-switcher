// ABOUTME: Main nv-switcher plugin class providing nvALT-style note switching
// ABOUTME: Handles plugin lifecycle, settings, commands and modal registration

import { App, Plugin, PluginSettingTab, Platform, Setting, Notice } from 'obsidian';
import { HotkeyManager } from './hotkey-manager';
import { NvModal } from './modal';
import { SearchProvider } from './search/provider';
import { BuiltInProvider } from './search/built-in-provider';
import { parseQuery } from './search/query-parser';

interface NvSwitcherSettings {
	schemaVersion: number;
	general: {
		openHotkey: string;
		createLocation: 'root' | 'same' | 'fixed';
		fixedFolder: string;
		includeCodeBlocks: boolean;
		maxResults: number;
		debounceMs: number;
		minQueryLength: number;
	};
	search: {
		backend: 'built-in' | 'auto' | 'omni';
		weights: {
			title: number;
			headings: number;
			path: number;
			tags: number;
			symbols: number;
			body: number;
			recency: number;
		};
		diacritics: boolean;
		regexCandidateK: number;
		recencyHalfLifeDays: number;
		excludeFolders: string[];
	};
	preview: {
		inlineSnippet: boolean;
		fragmentLength: number;
		maxFragments: number;
		showFrontmatter: boolean;
		showTags: boolean;
		showPath: boolean;
		highlightCssVar: string;
		highlightColor: string;
	};
	commands: {
		enableCommandsPrefix: boolean;
		commandsPrefixChar: string;
		showCommandIds: boolean;
		openInSplitModifier: 'mod' | 'alt' | 'shift' | 'ctrl';
	};
	keyboard: {
		chordSeparator: string;
		platformMetaKey: 'mod' | 'cmdCtrl';
	};
	hotkeys: {
		moveUp: string[];
		moveDown: string[];
		open: string[];
		forceCreate: string[];
		openInSplit: string[];
		focusPreview: string[];
		cycleLeft: string[];
		cycleRight: string[];
		close: string[];
		toggleCommandsMode: string[];
		clearQuery: string[];
		acceptSelection: string[];
	};
}

const DEFAULT_SETTINGS: NvSwitcherSettings = {
	schemaVersion: 1,
	general: {
		openHotkey: Platform.isMacOS ? '⌘N' : 'Ctrl+N',
		createLocation: 'root',
		fixedFolder: '',
		includeCodeBlocks: false,
		maxResults: 100,
		debounceMs: 150,
		minQueryLength: 1,
	},
	search: {
		backend: 'built-in',
		weights: {
			title: 4.0,
			headings: 2.0,
			path: 1.5,
			tags: 1.5,
			symbols: 1.5,
			body: 1.0,
			recency: 0.5,
		},
		diacritics: true,
		regexCandidateK: 300,
		recencyHalfLifeDays: 30,
		excludeFolders: [],
	},
	preview: {
		inlineSnippet: true,
		fragmentLength: 120,
		maxFragments: 3,
		showFrontmatter: false,
		showTags: true,
		showPath: true,
		highlightCssVar: '--nv-switcher-highlight-color',
		highlightColor: '',
	},
	commands: {
		enableCommandsPrefix: true,
		commandsPrefixChar: '>',
		showCommandIds: false,
		openInSplitModifier: 'mod',
	},
	keyboard: {
		chordSeparator: '+',
		platformMetaKey: Platform.isMacOS ? 'mod' : 'cmdCtrl',
	},
	hotkeys: {
		moveUp: [Platform.isMacOS ? '⌘K' : 'Ctrl+K', 'ArrowUp'],
		moveDown: [Platform.isMacOS ? '⌘J' : 'Ctrl+J', 'ArrowDown'],
		open: ['Enter'],
		forceCreate: ['Shift+Enter'],
		openInSplit: [Platform.isMacOS ? '⌘Enter' : 'Ctrl+Enter'],
		focusPreview: ['Tab'],
		cycleLeft: [Platform.isMacOS ? '⌥ArrowLeft' : 'Alt+ArrowLeft'],
		cycleRight: [Platform.isMacOS ? '⌥ArrowRight' : 'Alt+ArrowRight'],
		close: ['Escape'],
		toggleCommandsMode: ['>'],
		clearQuery: [Platform.isMacOS ? '⌘Backspace' : 'Ctrl+Backspace'],
		acceptSelection: ['Enter'],
	},
}

export default class NvSwitcherPlugin extends Plugin {
	settings: NvSwitcherSettings = DEFAULT_SETTINGS;
	hotkeyManager: HotkeyManager | null = null;
	private searchProvider: SearchProvider | null = null;

	async onload() {
		await this.loadSettings();
		this.registerCommands();

		// Add settings tab
		this.addSettingTab(new NvSwitcherSettingsTab(this.app, this));
	}

	private registerCommands() {
		// Initialize hotkey manager
		this.hotkeyManager = new HotkeyManager(this.settings.hotkeys);

		// Register the main nv-switcher command with hotkey from settings
		const openHotkey = this.settings.general.openHotkey || (Platform.isMacOS ? '⌘N' : 'Ctrl+N');
		const openHotkeys = HotkeyManager.parseAccelToObsidianHotkeys(openHotkey);

		this.addCommand({
			id: 'open',
			name: 'Open nv-switcher',
			hotkeys: openHotkeys,
			callback: () => {
				this.openModal();
			}
		});

		// Register toggle inline snippet command
		this.addCommand({
			id: 'toggle-inline-snippet',
			name: 'Toggle inline snippet',
			callback: async () => {
				this.settings.preview.inlineSnippet = !this.settings.preview.inlineSnippet;
				await this.saveSettings();
				
				// Show a brief notice about the change
				new Notice(
					`Inline snippets ${this.settings.preview.inlineSnippet ? 'enabled' : 'disabled'}`
				);
			}
		});
	}

	private openModal() {
		const modal = new NvModal(this.app, this);
		modal.open();
	}

	/**
	 * Open a file in a new split
	 */
	async openFileInSplit(filePath: string) {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file) {
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.openFile(file as any);
		}
	}

	/**
	 * Open a file in the current leaf
	 */
	async openFile(filePath: string) {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file) {
			const leaf = this.app.workspace.activeLeaf;
			if (leaf) {
				await leaf.openFile(file as any);
			}
		}
	}

	onunload() {
		this.removeHighlightColor();
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = migrateSettings(data);
		this.applyHighlightColor();
		
		// Update hotkey manager if it exists
		if (this.hotkeyManager) {
			this.hotkeyManager.updateHotkeys(this.settings.hotkeys);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// Update hotkey manager when settings change
		if (this.hotkeyManager) {
			this.hotkeyManager.updateHotkeys(this.settings.hotkeys);
		}
	}

	applyHighlightColor() {
		if (this.settings.preview.highlightColor) {
			document.documentElement.style.setProperty(
				this.settings.preview.highlightCssVar,
				this.settings.preview.highlightColor
			);
		}
	}

	removeHighlightColor() {
		document.documentElement.style.removeProperty(this.settings.preview.highlightCssVar);
	}

	// Expose helper methods for other modules
	toScorerConfig() {
		return toScorerConfig(this.settings);
	}

	isCommandsQuery(input: string): boolean {
		return isCommandsQuery(input, this.settings);
	}

	getNormalizedHotkeys(): Record<string, string[]> {
		return getNormalizedHotkeys(this.settings);
	}

	getHotkeyManager(): HotkeyManager | null {
		return this.hotkeyManager;
	}

	// Search system accessors
	getSearchProvider(): SearchProvider {
		// For now, return the built-in provider
		// This will be expanded to support multiple backends later
		if (!this.searchProvider) {
			this.searchProvider = new BuiltInProvider();
		}
		return this.searchProvider;
	}

	getQueryParser() {
		return {
			parseQuery: (input: string, settings: any) => parseQuery(input, settings)
		};
	}

}

// Migration function to upgrade settings between schema versions
function migrateSettings(prev: any): NvSwitcherSettings {
	// If no previous settings, return defaults
	if (!prev) {
		return { ...DEFAULT_SETTINGS };
	}

	// If already current version, merge with defaults for missing fields
	if (prev.schemaVersion === DEFAULT_SETTINGS.schemaVersion) {
		return {
			...DEFAULT_SETTINGS,
			...prev,
			general: { ...DEFAULT_SETTINGS.general, ...prev.general },
			search: { 
				...DEFAULT_SETTINGS.search, 
				...prev.search,
				weights: { ...DEFAULT_SETTINGS.search.weights, ...prev.search?.weights }
			},
			preview: { ...DEFAULT_SETTINGS.preview, ...prev.preview },
			commands: { ...DEFAULT_SETTINGS.commands, ...prev.commands },
			keyboard: { ...DEFAULT_SETTINGS.keyboard, ...prev.keyboard },
			hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...prev.hotkeys },
		};
	}

	// Migrate from v0 (legacy) to v1
	if (!prev.schemaVersion || prev.schemaVersion === 0) {
		const migrated: NvSwitcherSettings = {
			...DEFAULT_SETTINGS,
			schemaVersion: 1,
		};

		// Preserve existing v0 fields that map to v1 structure
		if (prev.defaultHotkey) {
			migrated.general.openHotkey = prev.defaultHotkey;
		}
		if (prev.searchLimit) {
			migrated.general.maxResults = Math.min(Math.max(prev.searchLimit, 10), 1000);
		}
		if (typeof prev.previewEnabled === 'boolean') {
			migrated.preview.inlineSnippet = prev.previewEnabled;
		}

		return migrated;
	}

	// For future versions, add migration logic here
	return { ...DEFAULT_SETTINGS, ...prev, schemaVersion: DEFAULT_SETTINGS.schemaVersion };
}

// Helper functions for settings validation and transformation
function validateFixedFolder(path: string): { isValid: boolean; error?: string } {
	if (!path || path.trim() === '') {
		return { isValid: true }; // Empty is valid (means disabled)
	}
	
	const normalized = path.trim().replace(/[\\]/g, '/');
	if (normalized.includes('..') || normalized.startsWith('/')) {
		return { isValid: false, error: 'Path cannot contain ".." or start with "/"' };
	}
	
	return { isValid: true };
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function validateCommandsPrefix(char: string): { isValid: boolean; error?: string } {
	if (!char || char.length !== 1) {
		return { isValid: false, error: 'Must be exactly one character' };
	}
	if (/\s/.test(char)) {
		return { isValid: false, error: 'Cannot be whitespace' };
	}
	return { isValid: true };
}

// Settings helper methods
function toScorerConfig(settings: NvSwitcherSettings): import('./search/scorer').ScorerConfig {
	return {
		weights: settings.search.weights,
		diacritics: settings.search.diacritics,
		recencyHalfLife: settings.search.recencyHalfLifeDays,
	};
}

function isCommandsQuery(input: string, settings: NvSwitcherSettings): boolean {
	if (!settings.commands.enableCommandsPrefix) return false;
	return input.startsWith(settings.commands.commandsPrefixChar);
}

function getNormalizedHotkeys(settings: NvSwitcherSettings): Record<string, string[]> {
	const normalized: Record<string, string[]> = {};
	
	for (const [action, chords] of Object.entries(settings.hotkeys)) {
		normalized[action] = chords.map(chord => {
			// Normalize platform-specific modifiers
			let normalized = chord;
			if (Platform.isMacOS) {
				normalized = normalized.replace(/Ctrl/g, '⌘').replace(/Alt/g, '⌥');
			} else {
				normalized = normalized.replace(/⌘/g, 'Ctrl').replace(/⌥/g, 'Alt');
			}
			return normalized;
		});
	}
	
	return normalized;
}

class NvSwitcherSettingsTab extends PluginSettingTab {
	plugin: NvSwitcherPlugin;

	constructor(app: App, plugin: NvSwitcherPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'nv-switcher Settings' });

		// General Settings
		containerEl.createEl('h3', { text: 'General' });
		
		new Setting(containerEl)
			.setName('Open hotkey')
			.setDesc('Keyboard shortcut to open the nv-switcher modal')
			.addText(text => text
				.setPlaceholder('⌘N')
				.setValue(this.plugin.settings.general.openHotkey)
				.onChange(async (value) => {
					this.plugin.settings.general.openHotkey = value;
					await this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Create location')
			.setDesc('Where to create new notes')
			.addDropdown(dropdown => dropdown
				.addOption('root', 'Vault root')
				.addOption('same', 'Same folder as active note')
				.addOption('fixed', 'Fixed folder')
				.setValue(this.plugin.settings.general.createLocation)
				.onChange(async (value) => {
					this.plugin.settings.general.createLocation = value as 'root' | 'same' | 'fixed';
					await this.debouncedSave();
					this.display(); // Refresh to show/hide fixed folder setting
				}));

		if (this.plugin.settings.general.createLocation === 'fixed') {
			new Setting(containerEl)
				.setName('Fixed folder')
				.setDesc('Folder path for new notes (relative to vault root)')
				.addText(text => text
					.setPlaceholder('Inbox')
					.setValue(this.plugin.settings.general.fixedFolder)
					.onChange(async (value) => {
						const validation = validateFixedFolder(value);
						if (validation.isValid) {
							this.plugin.settings.general.fixedFolder = value;
							await this.debouncedSave();
						}
						// TODO: Show validation error if invalid
					}));
		}

		new Setting(containerEl)
			.setName('Include code blocks')
			.setDesc('Include code block content in search index')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.general.includeCodeBlocks)
				.onChange(async (value) => {
					this.plugin.settings.general.includeCodeBlocks = value;
					await this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Max results')
			.setDesc('Maximum number of search results to display (10-1000)')
			.addSlider(slider => slider
				.setLimits(10, 1000, 10)
				.setValue(this.plugin.settings.general.maxResults)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.general.maxResults = value;
					await this.debouncedSave();
				}));

		// Search Settings
		containerEl.createEl('h3', { text: 'Search' });

		new Setting(containerEl)
			.setName('Search backend')
			.setDesc('Search engine to use')
			.addDropdown(dropdown => dropdown
				.addOption('built-in', 'Built-in (recommended)')
				.addOption('auto', 'Auto (built-in + omnisearch when available)')
				.addOption('omni', 'Omnisearch (if installed)')
				.setValue(this.plugin.settings.search.backend)
				.onChange(async (value) => {
					this.plugin.settings.search.backend = value as 'built-in' | 'auto' | 'omni';
					await this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Diacritic folding')
			.setDesc('Ignore accents and diacritics in search (café matches cafe)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.search.diacritics)
				.onChange(async (value) => {
					this.plugin.settings.search.diacritics = value;
					await this.debouncedSave();
				}));

		// Search weights
		containerEl.createEl('h4', { text: 'Search Weights' });
		const weights = this.plugin.settings.search.weights;
		
		for (const [field, weight] of Object.entries(weights)) {
			new Setting(containerEl)
				.setName(`${field.charAt(0).toUpperCase() + field.slice(1)} weight`)
				.setDesc(`Boost factor for ${field} matches`)
				.addSlider(slider => slider
					.setLimits(0, 5, 0.1)
					.setValue(weight)
					.setDynamicTooltip()
					.onChange(async (value) => {
						(this.plugin.settings.search.weights as any)[field] = value;
						await this.debouncedSave();
					}));
		}

		// Preview Settings
		containerEl.createEl('h3', { text: 'Preview' });

		new Setting(containerEl)
			.setName('Inline snippet')
			.setDesc('Show inline text snippets in search results')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.preview.inlineSnippet)
				.onChange(async (value) => {
					this.plugin.settings.preview.inlineSnippet = value;
					await this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Fragment length')
			.setDesc('Length of text fragments in preview (60-240 characters)')
			.addSlider(slider => slider
				.setLimits(60, 240, 10)
				.setValue(this.plugin.settings.preview.fragmentLength)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.preview.fragmentLength = value;
					await this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Max fragments')
			.setDesc('Maximum number of preview fragments to show (1-5)')
			.addSlider(slider => slider
				.setLimits(1, 5, 1)
				.setValue(this.plugin.settings.preview.maxFragments)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.preview.maxFragments = value;
					await this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Show frontmatter')
			.setDesc('Display frontmatter in preview')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.preview.showFrontmatter)
				.onChange(async (value) => {
					this.plugin.settings.preview.showFrontmatter = value;
					await this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Show tags')
			.setDesc('Display tags in preview header')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.preview.showTags)
				.onChange(async (value) => {
					this.plugin.settings.preview.showTags = value;
					await this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Show path')
			.setDesc('Display file path in results')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.preview.showPath)
				.onChange(async (value) => {
					this.plugin.settings.preview.showPath = value;
					await this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Highlight color')
			.setDesc('Custom color for search highlights (leave empty for theme default)')
			.addText(text => text
				.setPlaceholder('#ffff00')
				.setValue(this.plugin.settings.preview.highlightColor)
				.onChange(async (value) => {
					this.plugin.settings.preview.highlightColor = value;
					this.plugin.applyHighlightColor();
					await this.debouncedSave();
				}));

		// Commands Settings
		containerEl.createEl('h3', { text: 'Commands' });

		new Setting(containerEl)
			.setName('Enable commands prefix')
			.setDesc('Allow typing ">" to search and run commands')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.commands.enableCommandsPrefix)
				.onChange(async (value) => {
					this.plugin.settings.commands.enableCommandsPrefix = value;
					await this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Commands prefix character')
			.setDesc('Character to enter commands mode')
			.addText(text => text
				.setPlaceholder('>')
				.setValue(this.plugin.settings.commands.commandsPrefixChar)
				.onChange(async (value) => {
					const validation = validateCommandsPrefix(value);
					if (validation.isValid) {
						this.plugin.settings.commands.commandsPrefixChar = value;
						await this.debouncedSave();
					}
					// TODO: Show validation error if invalid
				}));

		new Setting(containerEl)
			.setName('Show command IDs')
			.setDesc('Display command IDs alongside names')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.commands.showCommandIds)
				.onChange(async (value) => {
					this.plugin.settings.commands.showCommandIds = value;
					await this.debouncedSave();
				}));

		// Hotkeys section would be complex - simplified for now
		containerEl.createEl('h3', { text: 'Keyboard & Hotkeys' });
		containerEl.createEl('p', { 
			text: 'Hotkey customization will be implemented in a future version. Current defaults are listed in the plugin description.' 
		});
	}

	private saveTimeout: NodeJS.Timeout | null = null;
	
	private async debouncedSave() {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = setTimeout(async () => {
			await this.plugin.saveSettings();
			this.saveTimeout = null;
		}, 300);
	}
}
