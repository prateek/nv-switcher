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

export const Platform = {
	isMacOS: false,
	isIosApp: false,
	isAndroidApp: false,
	isMobile: false,
	isDesktopApp: true,
	isWin: process.platform === 'win32',
	isLinux: process.platform === 'linux',
	isMac: process.platform === 'darwin'
}

export class Setting {
	settingEl: HTMLElement = document.createElement('div')
	
	constructor(containerEl: HTMLElement) {
		containerEl.appendChild(this.settingEl)
	}

	setName(name: string) {
		return this
	}

	setDesc(desc: string) {
		return this
	}

	addText(callback: (text: any) => any) {
		const textComponent = {
			setPlaceholder: vi.fn().mockReturnThis(),
			setValue: vi.fn().mockReturnThis(),
			onChange: vi.fn().mockReturnThis(),
			setDynamicTooltip: vi.fn().mockReturnThis()
		}
		callback(textComponent)
		return this
	}

	addToggle(callback: (toggle: any) => any) {
		const toggleComponent = {
			setValue: vi.fn().mockReturnThis(),
			onChange: vi.fn().mockReturnThis()
		}
		callback(toggleComponent)
		return this
	}

	addDropdown(callback: (dropdown: any) => any) {
		const dropdownComponent = {
			addOption: vi.fn().mockReturnThis(),
			setValue: vi.fn().mockReturnThis(),
			onChange: vi.fn().mockReturnThis()
		}
		callback(dropdownComponent)
		return this
	}

	addSlider(callback: (slider: any) => any) {
		const sliderComponent = {
			setLimits: vi.fn().mockReturnThis(),
			setValue: vi.fn().mockReturnThis(),
			onChange: vi.fn().mockReturnThis(),
			setDynamicTooltip: vi.fn().mockReturnThis()
		}
		callback(sliderComponent)
		return this
	}
}