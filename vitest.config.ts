// ABOUTME: Vitest configuration for testing Obsidian plugin with JSDOM environment
// ABOUTME: Provides testing setup with Obsidian API mocks and DOM simulation

import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
	test: {
		environment: 'jsdom',
		globals: true,
		testTimeout: 10000,
		setupFiles: ['./src/test/setup.ts'],
		include: ['src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'src/test/',
				'**/*.test.ts'
			]
		}
	},
	resolve: {
		alias: {
			'obsidian': resolve(__dirname, 'src/test/obsidian-mock.ts')
		}
	}
})