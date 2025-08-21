// ABOUTME: Vitest test setup with Obsidian API mocks and DOM configuration
// ABOUTME: Provides base testing environment for plugin unit tests

import { vi } from 'vitest'

// Mock DOM globals that Obsidian expects
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: vi.fn().mockImplementation(query => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
})

// Set up basic DOM structure
document.body.innerHTML = '<div id="app"></div>'