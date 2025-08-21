// ABOUTME: Unit tests for the main NvSwitcherPlugin class
// ABOUTME: Tests plugin loading, settings, and command registration

import { describe, it, expect } from 'vitest'
import { App } from 'obsidian'
import NvSwitcherPlugin from './plugin'

describe('NvSwitcherPlugin', () => {
	it('should load with default settings and initialize correctly', async () => {
		const mockApp = new App()
		const mockManifest = { 
			id: 'nv-switcher', 
			version: '1.0.0',
			name: 'nv-switcher',
			author: 'Prateek Rungta',
			minAppVersion: '1.5.0',
			description: 'Test plugin'
		}
		
		const plugin = new NvSwitcherPlugin(mockApp, mockManifest)
		
		// Test initial state before loading
		expect(plugin.settings.schemaVersion).toBe(1)
		expect(plugin.settings.general.maxResults).toBe(100)
		expect(plugin.settings.preview.inlineSnippet).toBe(true)
		
		// Load the plugin
		await plugin.onload()
		
		// Verify settings remain correct after loading  
		expect(plugin.settings.schemaVersion).toBe(1)
		expect(plugin.settings.general.includeCodeBlocks).toBe(false)
		expect(plugin.settings.search.backend).toBe('built-in')
		
		// Verify onload completed without throwing errors
		expect(plugin.app).toBe(mockApp)
		expect(plugin.manifest).toBe(mockManifest)
	})

	it('should save and load settings correctly', async () => {
		const mockApp = new App()
		const mockManifest = { 
			id: 'nv-switcher', 
			version: '1.0.0',
			name: 'nv-switcher',
			author: 'Prateek Rungta',
			minAppVersion: '1.5.0',
			description: 'Test plugin'
		}
		
		const plugin = new NvSwitcherPlugin(mockApp, mockManifest)
		plugin.loadData = vi.fn().mockResolvedValue({
			schemaVersion: 1,
			general: {
				maxResults: 200,
				includeCodeBlocks: true
			},
			preview: {
				inlineSnippet: false
			}
		})
		
		await plugin.loadSettings()
		
		expect(plugin.settings.general.maxResults).toBe(200)
		expect(plugin.settings.general.includeCodeBlocks).toBe(true) 
		expect(plugin.settings.preview.inlineSnippet).toBe(false)
		expect(plugin.settings.general.openHotkey).toBeDefined() // Should keep default
	})

	it('should migrate v0 settings to v1', async () => {
		const mockApp = new App()
		const mockManifest = { 
			id: 'nv-switcher', 
			version: '1.0.0',
			name: 'nv-switcher',
			author: 'Prateek Rungta',
			minAppVersion: '1.5.0',
			description: 'Test plugin'
		}
		
		const plugin = new NvSwitcherPlugin(mockApp, mockManifest)
		plugin.loadData = vi.fn().mockResolvedValue({
			// v0 legacy settings
			defaultHotkey: 'Ctrl+K',
			searchLimit: 75,
			previewEnabled: false
		})
		
		await plugin.loadSettings()
		
		// Check migrated values
		expect(plugin.settings.schemaVersion).toBe(1)
		expect(plugin.settings.general.openHotkey).toBe('Ctrl+K')
		expect(plugin.settings.general.maxResults).toBe(75)
		expect(plugin.settings.preview.inlineSnippet).toBe(false)
		
		// Check new fields have defaults
		expect(plugin.settings.search.backend).toBe('built-in')
		expect(plugin.settings.commands.enableCommandsPrefix).toBe(true)
	})
})