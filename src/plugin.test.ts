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
		expect(plugin.settings).toEqual({
			defaultHotkey: 'Ctrl+O',
			searchLimit: 50,
			previewEnabled: true
		})
		
		// Load the plugin
		await plugin.onload()
		
		// Verify settings remain correct after loading  
		expect(plugin.settings).toEqual({
			defaultHotkey: 'Ctrl+O',
			searchLimit: 50,
			previewEnabled: true
		})
		
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
			searchLimit: 100,
			previewEnabled: false
		})
		
		await plugin.loadSettings()
		
		expect(plugin.settings.searchLimit).toBe(100)
		expect(plugin.settings.previewEnabled).toBe(false)
		expect(plugin.settings.defaultHotkey).toBe('Ctrl+O') // Should keep default
	})
})