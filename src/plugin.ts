// ABOUTME: Main nv-switcher plugin class providing nvALT-style note switching
// ABOUTME: Handles plugin lifecycle, settings, commands and modal registration

import { App, Plugin, PluginSettingTab } from 'obsidian';

interface NvSwitcherSettings {
	defaultHotkey: string;
	searchLimit: number;
	previewEnabled: boolean;
}

const DEFAULT_SETTINGS: NvSwitcherSettings = {
	defaultHotkey: 'Ctrl+O',
	searchLimit: 50,
	previewEnabled: true
}

export default class NvSwitcherPlugin extends Plugin {
	settings: NvSwitcherSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// Register the main nv-switcher command
		this.addCommand({
			id: 'open-nv-switcher',
			name: 'Open nv-switcher',
			hotkeys: [{ modifiers: ['Ctrl'], key: 'o' }],
			callback: () => {
				// TODO: Open the search modal
				console.log('nv-switcher opened');
			}
		});

		// Add settings tab
		this.addSettingTab(new NvSwitcherSettingsTab(this.app, this));
	}

	onunload() {
		// Cleanup will be handled automatically by Obsidian
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
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

		// TODO: Add proper settings UI as per task requirements
		containerEl.createEl('p', { 
			text: 'Settings interface will be implemented in task 2.' 
		});
	}
}
