// ABOUTME: Integration tests for plugin commands and hotkey registration
// ABOUTME: Tests command registration, settings integration, and hotkey parsing

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from 'obsidian';
import NvSwitcherPlugin from './plugin';

// Create a proper mock app
const createMockApp = (): App => {
	return {
		vault: {
			getAbstractFileByPath: vi.fn(),
			getFiles: vi.fn(() => []),
			read: vi.fn(),
			modify: vi.fn(),
			create: vi.fn(),
		},
		workspace: {
			activeLeaf: {
				openFile: vi.fn()
			},
			getLeaf: vi.fn((newLeaf) => ({
				openFile: vi.fn()
			}))
		},
		metadataCache: {
			getFileCache: vi.fn()
		}
	} as any;
};

describe('NvSwitcherPlugin Commands', () => {
	let plugin: NvSwitcherPlugin;
	let mockApp: App;

	beforeEach(() => {
		mockApp = createMockApp();
		plugin = new NvSwitcherPlugin(mockApp, {
			id: 'nv-switcher',
			name: 'nv-switcher',
			version: '1.0.0'
		} as any);

		// Mock the plugin methods
		plugin.addCommand = vi.fn();
		plugin.addSettingTab = vi.fn();
		plugin.loadData = vi.fn().mockResolvedValue(null);
		plugin.saveData = vi.fn().mockResolvedValue(undefined);
	});

	describe('onload', () => {
		it('should register commands on load', async () => {
			await plugin.onload();

			expect(plugin.addCommand).toHaveBeenCalledTimes(2);
			
			// Check open command
			const openCommand = vi.mocked(plugin.addCommand).mock.calls.find(
				call => call[0].id === 'open'
			);
			expect(openCommand).toBeDefined();
			expect(openCommand![0]).toMatchObject({
				id: 'open',
				name: 'Open nv-switcher'
			});

			// Check toggle-inline-snippet command
			const toggleCommand = vi.mocked(plugin.addCommand).mock.calls.find(
				call => call[0].id === 'toggle-inline-snippet'
			);
			expect(toggleCommand).toBeDefined();
			expect(toggleCommand![0]).toMatchObject({
				id: 'toggle-inline-snippet',
				name: 'Toggle inline snippet'
			});
		});

		it('should initialize hotkey manager', async () => {
			await plugin.onload();

			expect(plugin.getHotkeyManager()).not.toBeNull();
		});
	});

	describe('toggle-inline-snippet command', () => {
		it('should toggle the setting and save', async () => {
			await plugin.onload();

			const initialValue = plugin.settings.preview.inlineSnippet;
			
			// Find and execute the toggle command
			const toggleCommand = vi.mocked(plugin.addCommand).mock.calls.find(
				call => call[0].id === 'toggle-inline-snippet'
			);
			expect(toggleCommand).toBeDefined();

			if (toggleCommand) {
				await toggleCommand[0].callback();
			}

			expect(plugin.settings.preview.inlineSnippet).toBe(!initialValue);
			expect(plugin.saveData).toHaveBeenCalled();
		});
	});

	describe('open command hotkey', () => {
		it('should use hotkey from settings', async () => {
			plugin.settings.general.openHotkey = 'Ctrl+N';
			await plugin.onload();

			const openCommand = vi.mocked(plugin.addCommand).mock.calls.find(
				call => call[0].id === 'open'
			);
			expect(openCommand).toBeDefined();
			if (openCommand) {
				expect(openCommand[0].hotkeys).toEqual([{
					modifiers: ['Ctrl'],
					key: 'n'
				}]);
			}
		});

		it('should fallback to default hotkey when not set', async () => {
			plugin.settings.general.openHotkey = '';
			await plugin.onload();

			const openCommand = vi.mocked(plugin.addCommand).mock.calls.find(
				call => call[0].id === 'open'
			);
			expect(openCommand).toBeDefined();
			if (openCommand) {
				expect(openCommand[0].hotkeys).toHaveLength(1);
				// Should have some default hotkey
				expect(openCommand[0].hotkeys[0].key).toBeDefined();
			}
		});
	});

	describe('file operations', () => {
		it('should open file in current leaf', async () => {
			const mockFile = { path: 'test.md' };
			vi.mocked(mockApp.vault.getAbstractFileByPath).mockReturnValue(mockFile as any);

			await plugin.openFile('test.md');

			expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith('test.md');
			if (mockApp.workspace.activeLeaf) {
				expect(mockApp.workspace.activeLeaf.openFile).toHaveBeenCalledWith(mockFile);
			}
		});

		it('should open file in new split', async () => {
			const mockFile = { path: 'test.md' };
			vi.mocked(mockApp.vault.getAbstractFileByPath).mockReturnValue(mockFile as any);

			const mockNewLeaf = { openFile: vi.fn() };
			vi.mocked(mockApp.workspace.getLeaf).mockReturnValue(mockNewLeaf as any);

			await plugin.openFileInSplit('test.md');

			expect(mockApp.workspace.getLeaf).toHaveBeenCalledWith(true);
			expect(mockNewLeaf.openFile).toHaveBeenCalledWith(mockFile);
		});

		it('should handle non-existent files gracefully', async () => {
			vi.mocked(mockApp.vault.getAbstractFileByPath).mockReturnValue(null);

			await expect(plugin.openFile('nonexistent.md')).resolves.not.toThrow();
			await expect(plugin.openFileInSplit('nonexistent.md')).resolves.not.toThrow();
		});
	});

	describe('settings integration', () => {
		it('should update hotkey manager when settings change', async () => {
			await plugin.onload();

			const hotkeyManager = plugin.getHotkeyManager();
			expect(hotkeyManager).not.toBeNull();

			const updateSpy = vi.spyOn(hotkeyManager!, 'updateHotkeys');

			await plugin.saveSettings();

			expect(updateSpy).toHaveBeenCalledWith(plugin.settings.hotkeys);
		});

		it('should handle settings migration', async () => {
			// Mock legacy settings
			plugin.loadData = vi.fn().mockResolvedValue({
				schemaVersion: 0,
				defaultHotkey: 'Alt+N',
				searchLimit: 50,
				previewEnabled: false
			});

			await plugin.onload();

			// Should migrate to new schema
			expect(plugin.settings.schemaVersion).toBe(1);
			expect(plugin.settings.general.openHotkey).toBe('Alt+N');
			expect(plugin.settings.general.maxResults).toBe(50);
			expect(plugin.settings.preview.inlineSnippet).toBe(false);
		});
	});
});