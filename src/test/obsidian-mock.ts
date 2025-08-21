// ABOUTME: Mock implementation of Obsidian API for testing purposes
// ABOUTME: Provides minimal viable mocks for Plugin, App, and other core classes

import { vi } from 'vitest'

export class Plugin {
	app: any
	manifest: any
	settings: any = {}

	constructor(app: any, manifest: any) {
		this.app = app
		this.manifest = manifest
	}

	async onload() {}
	async onunload() {}

	addCommand = vi.fn()
	addRibbonIcon = vi.fn()
	addSettingTab = vi.fn()
	registerEvent = vi.fn()
	registerDomEvent = vi.fn()
	registerInterval = vi.fn()

	async loadData() {
		return this.settings
	}

	async saveData(data: any) {
		this.settings = data
	}
}

export class App {
	vault: any = {
		getFiles: vi.fn(() => []),
		getFileByPath: vi.fn(),
		read: vi.fn(),
		modify: vi.fn(),
		create: vi.fn(),
		delete: vi.fn(),
		on: vi.fn()
	}

	workspace: any = {
		getActiveFile: vi.fn(),
		openLinkText: vi.fn()
	}

	metadataCache: any = {
		getFileCache: vi.fn(),
		on: vi.fn()
	}
}

export class PluginSettingTab {
	app: App
	plugin: Plugin
	containerEl: HTMLElement = document.createElement('div')

	constructor(app: App, plugin: Plugin) {
		this.app = app
		this.plugin = plugin
	}

	display() {}
	hide() {}
}

export class Notice {
	constructor(message: string, timeout?: number) {
		console.log(`Notice: ${message}`)
	}
}

export class Modal {
	app: App
	contentEl: HTMLElement = document.createElement('div')
	modalEl: HTMLElement = document.createElement('div')

	constructor(app: App) {
		this.app = app
	}

	open() {}
	close() {}
	onOpen() {}
	onClose() {}
}

export class Component {
	register = vi.fn()
	registerEvent = vi.fn()
	registerDomEvent = vi.fn()
	registerInterval = vi.fn()
}