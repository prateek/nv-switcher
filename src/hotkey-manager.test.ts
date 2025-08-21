// ABOUTME: Tests for HotkeyManager to verify cross-platform hotkey parsing and matching
// ABOUTME: Covers accelerator parsing, modifier normalization, and KeyboardEvent matching

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HotkeyManager } from './hotkey-manager';

// Mock Obsidian modules
vi.mock('obsidian', () => ({
	Platform: {
		isMacOS: false // Default to non-macOS for most tests
	},
	Keymap: {
		isModifier: vi.fn((key: string) => ['Control', 'Alt', 'Shift', 'Meta'].includes(key))
	}
}));

describe('HotkeyManager', () => {
	let hotkeyManager: HotkeyManager;
	const testHotkeys = {
		moveUp: ['K', 'ArrowUp'],
		moveDown: ['J', 'ArrowDown'],
		open: ['Enter'],
		openInSplit: ['Mod+Enter'],
		close: ['Escape'],
		focusPreview: ['Tab'],
		cycleLeft: ['Alt+ArrowLeft'],
		cycleRight: ['Alt+ArrowRight'],
		forceCreate: ['Shift+Enter']
	};

	beforeEach(() => {
		hotkeyManager = new HotkeyManager(testHotkeys);
	});

	describe('parseAccelerator', () => {
		it('should parse simple keys', () => {
			expect(hotkeyManager['parseAccelerator']('k')).toEqual({
				modifiers: [],
				key: 'k'
			});
		});

		it('should parse keys with modifiers', () => {
			expect(hotkeyManager['parseAccelerator']('Mod+Enter')).toEqual({
				modifiers: ['Mod'],
				key: 'Enter'
			});

			expect(hotkeyManager['parseAccelerator']('Shift+Enter')).toEqual({
				modifiers: ['Shift'],
				key: 'Enter'
			});

			expect(hotkeyManager['parseAccelerator']('Alt+ArrowLeft')).toEqual({
				modifiers: ['Alt'],
				key: 'ArrowLeft'
			});
		});

		it('should parse multiple modifiers', () => {
			expect(hotkeyManager['parseAccelerator']('Ctrl+Shift+A')).toEqual({
				modifiers: ['Ctrl', 'Shift'],
				key: 'A'
			});
		});

		it('should handle dash separators', () => {
			expect(hotkeyManager['parseAccelerator']('Ctrl-Enter')).toEqual({
				modifiers: ['Ctrl'],
				key: 'Enter'
			});
		});
	});

	describe('normalizeModifiers', () => {
		it('should normalize symbol modifiers', () => {
			expect(hotkeyManager['normalizeModifiers'](['⌘'])).toEqual(['cmd']);
			expect(hotkeyManager['normalizeModifiers'](['⌥'])).toEqual(['alt']);
			expect(hotkeyManager['normalizeModifiers'](['⇧'])).toEqual(['shift']);
			expect(hotkeyManager['normalizeModifiers'](['⌃'])).toEqual(['ctrl']);
		});

		it('should normalize text modifiers', () => {
			expect(hotkeyManager['normalizeModifiers'](['Command'])).toEqual(['cmd']);
			expect(hotkeyManager['normalizeModifiers'](['Option'])).toEqual(['alt']);
			expect(hotkeyManager['normalizeModifiers'](['Ctrl'])).toEqual(['ctrl']);
		});

		it('should preserve already normalized modifiers', () => {
			expect(hotkeyManager['normalizeModifiers'](['mod', 'shift', 'alt'])).toEqual(['mod', 'shift', 'alt']);
		});
	});

	describe('matchHotkey', () => {
		it('should match simple keys', () => {
			const event = new KeyboardEvent('keydown', { key: 'k' });
			expect(hotkeyManager.matchHotkey(event, 'k')).toBe(true);
			expect(hotkeyManager.matchHotkey(event, 'j')).toBe(false);
		});

		it('should match special keys', () => {
			const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
			expect(hotkeyManager.matchHotkey(enterEvent, 'Enter')).toBe(true);

			const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
			expect(hotkeyManager.matchHotkey(escapeEvent, 'Escape')).toBe(true);

			const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
			expect(hotkeyManager.matchHotkey(tabEvent, 'Tab')).toBe(true);
		});

		it('should match arrow keys', () => {
			const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
			expect(hotkeyManager.matchHotkey(upEvent, 'ArrowUp')).toBe(true);

			const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
			expect(hotkeyManager.matchHotkey(downEvent, 'ArrowDown')).toBe(true);
		});

		it('should match keys with modifiers', () => {
			const shiftEnterEvent = new KeyboardEvent('keydown', { 
				key: 'Enter', 
				shiftKey: true 
			});
			expect(hotkeyManager.matchHotkey(shiftEnterEvent, 'Shift+Enter')).toBe(true);
			expect(hotkeyManager.matchHotkey(shiftEnterEvent, 'Enter')).toBe(false);

			const altLeftEvent = new KeyboardEvent('keydown', { 
				key: 'ArrowLeft', 
				altKey: true 
			});
			expect(hotkeyManager.matchHotkey(altLeftEvent, 'Alt+ArrowLeft')).toBe(true);
			expect(hotkeyManager.matchHotkey(altLeftEvent, 'ArrowLeft')).toBe(false);
		});

		it('should handle Mod key on non-macOS', () => {
			const ctrlEnterEvent = new KeyboardEvent('keydown', { 
				key: 'Enter', 
				ctrlKey: true 
			});
			expect(hotkeyManager.matchHotkey(ctrlEnterEvent, 'Mod+Enter')).toBe(true);

			// Meta key should not match Mod on non-macOS
			const metaEnterEvent = new KeyboardEvent('keydown', { 
				key: 'Enter', 
				metaKey: true 
			});
			expect(hotkeyManager.matchHotkey(metaEnterEvent, 'Mod+Enter')).toBe(false);
		});

		it('should reject events with unexpected modifiers', () => {
			const ctrlKEvent = new KeyboardEvent('keydown', { 
				key: 'k', 
				ctrlKey: true 
			});
			expect(hotkeyManager.matchHotkey(ctrlKEvent, 'k')).toBe(false);
		});
	});

	describe('is method', () => {
		it('should match actions against hotkeys', () => {
			const kEvent = new KeyboardEvent('keydown', { key: 'k' });
			expect(hotkeyManager.is('moveUp', kEvent)).toBe(true);
			expect(hotkeyManager.is('moveDown', kEvent)).toBe(false);

			const jEvent = new KeyboardEvent('keydown', { key: 'j' });
			expect(hotkeyManager.is('moveDown', jEvent)).toBe(true);
			expect(hotkeyManager.is('moveUp', jEvent)).toBe(false);
		});

		it('should handle multiple accelerators per action', () => {
			const kEvent = new KeyboardEvent('keydown', { key: 'k' });
			const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
			
			expect(hotkeyManager.is('moveUp', kEvent)).toBe(true);
			expect(hotkeyManager.is('moveUp', upEvent)).toBe(true);
		});

		it('should return false for unknown actions', () => {
			const kEvent = new KeyboardEvent('keydown', { key: 'k' });
			expect(hotkeyManager.is('unknownAction', kEvent)).toBe(false);
		});
	});

	describe('parseAccelToObsidianHotkeys', () => {
		it('should convert to Obsidian format', () => {
			expect(HotkeyManager.parseAccelToObsidianHotkeys('Mod+N')).toEqual([{
				modifiers: ['Mod'],
				key: 'n'
			}]);

			expect(HotkeyManager.parseAccelToObsidianHotkeys('Shift+Enter')).toEqual([{
				modifiers: ['Shift'],
				key: 'enter'
			}]);

			expect(HotkeyManager.parseAccelToObsidianHotkeys('Alt+ArrowLeft')).toEqual([{
				modifiers: ['Alt'],
				key: 'arrowleft'
			}]);
		});

		it('should handle symbol modifiers', () => {
			expect(HotkeyManager.parseAccelToObsidianHotkeys('⌘N')).toEqual([{
				modifiers: ['Cmd'],
				key: 'n'
			}]);

			expect(HotkeyManager.parseAccelToObsidianHotkeys('⌥ArrowLeft')).toEqual([{
				modifiers: ['Alt'],
				key: 'arrowleft'
			}]);
		});

		it('should return empty array for invalid accelerators', () => {
			expect(HotkeyManager.parseAccelToObsidianHotkeys('')).toEqual([]);
			expect(HotkeyManager.parseAccelToObsidianHotkeys(null as any)).toEqual([]);
		});
	});

	describe('updateHotkeys', () => {
		it('should update hotkey mappings', () => {
			const newHotkeys = {
				moveUp: ['W'],
				moveDown: ['S']
			};

			hotkeyManager.updateHotkeys(newHotkeys);

			const wEvent = new KeyboardEvent('keydown', { key: 'w' });
			const sEvent = new KeyboardEvent('keydown', { key: 's' });
			const kEvent = new KeyboardEvent('keydown', { key: 'k' });

			expect(hotkeyManager.is('moveUp', wEvent)).toBe(true);
			expect(hotkeyManager.is('moveDown', sEvent)).toBe(true);
			expect(hotkeyManager.is('moveUp', kEvent)).toBe(false); // Old binding should be gone
		});
	});

	describe('utility methods', () => {
		it('should get accelerators for action', () => {
			expect(hotkeyManager.getAcceleratorsForAction('moveUp')).toEqual(['K', 'ArrowUp']);
			expect(hotkeyManager.getAcceleratorsForAction('unknownAction')).toEqual([]);
		});

		it('should get actions for accelerator', () => {
			expect(hotkeyManager.getActionsForAccelerator('K')).toEqual(['moveUp']);
			expect(hotkeyManager.getActionsForAccelerator('Enter')).toEqual(['open']);
			expect(hotkeyManager.getActionsForAccelerator('UnknownKey')).toEqual([]);
		});
	});
});

// Test macOS-specific behavior
describe('HotkeyManager on macOS', () => {
	beforeEach(async () => {
		// Mock Platform.isMacOS to return true
		const obsidian = await import('obsidian');
		vi.mocked(obsidian.Platform).isMacOS = true;
	});

	afterEach(async () => {
		// Reset to default
		const obsidian = await import('obsidian');
		vi.mocked(obsidian.Platform).isMacOS = false;
	});

	it('should handle Mod key on macOS', () => {
		const hotkeyManager = new HotkeyManager({ openInSplit: ['Mod+Enter'] });

		// Meta key should match Mod on macOS
		const metaEnterEvent = new KeyboardEvent('keydown', { 
			key: 'Enter', 
			metaKey: true 
		});
		expect(hotkeyManager.matchHotkey(metaEnterEvent, 'Mod+Enter')).toBe(true);

		// Ctrl key should not match Mod on macOS
		const ctrlEnterEvent = new KeyboardEvent('keydown', { 
			key: 'Enter', 
			ctrlKey: true 
		});
		expect(hotkeyManager.matchHotkey(ctrlEnterEvent, 'Mod+Enter')).toBe(false);
	});
});