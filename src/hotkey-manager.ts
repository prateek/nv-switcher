// ABOUTME: HotkeyManager for parsing and matching keyboard shortcuts in nv-switcher
// ABOUTME: Handles cross-platform modifier normalization and accelerator string parsing

import { Keymap, Platform, Hotkey, Modifier } from 'obsidian';

export interface ParsedHotkey {
	modifiers: string[];
	key: string;
}

export interface HotkeyAction {
	action: string;
	accelerators: string[];
}

export class HotkeyManager {
	private actionMap = new Map<string, string[]>();

	constructor(hotkeySettings: Record<string, string[]>) {
		this.updateHotkeys(hotkeySettings);
	}

	/**
	 * Update the hotkey mappings from settings
	 */
	updateHotkeys(hotkeySettings: Record<string, string[]>) {
		this.actionMap.clear();
		for (const [action, accelerators] of Object.entries(hotkeySettings)) {
			this.actionMap.set(action, accelerators);
		}
	}

	/**
	 * Check if a keyboard event matches the given action
	 */
	is(action: string, evt: KeyboardEvent): boolean {
		const accelerators = this.actionMap.get(action);
		if (!accelerators) return false;

		return accelerators.some(accel => this.matchHotkey(evt, accel));
	}

	/**
	 * Match a keyboard event against an accelerator string
	 */
	matchHotkey(evt: KeyboardEvent, accelerator: string): boolean {
		const parsed = this.parseAccelerator(accelerator);
		if (!parsed) return false;

		// Check key match (case insensitive)
		if (evt.key.toLowerCase() !== parsed.key.toLowerCase()) {
			// Handle special cases
			if (parsed.key === 'ArrowUp' && evt.key !== 'ArrowUp') return false;
			if (parsed.key === 'ArrowDown' && evt.key !== 'ArrowDown') return false;
			if (parsed.key === 'ArrowLeft' && evt.key !== 'ArrowLeft') return false;
			if (parsed.key === 'ArrowRight' && evt.key !== 'ArrowRight') return false;
			if (parsed.key === 'Enter' && evt.key !== 'Enter') return false;
			if (parsed.key === 'Escape' && evt.key !== 'Escape') return false;
			if (parsed.key === 'Tab' && evt.key !== 'Tab') return false;
			if (parsed.key === 'Backspace' && evt.key !== 'Backspace') return false;
			
			// For regular keys, check case-insensitive
			if (evt.key.toLowerCase() !== parsed.key.toLowerCase()) return false;
		}

		// Check modifiers
		const expectedModifiers = this.normalizeModifiers(parsed.modifiers);
		
		const actualModifiers = {
			ctrl: evt.ctrlKey,
			cmd: evt.metaKey,
			alt: evt.altKey,
			shift: evt.shiftKey
		};

		// Check each expected modifier
		for (const modifier of expectedModifiers) {
			switch (modifier) {
				case 'ctrl':
					if (!actualModifiers.ctrl) return false;
					break;
				case 'cmd':
				case 'meta':
					if (!actualModifiers.cmd) return false;
					break;
				case 'alt':
					if (!actualModifiers.alt) return false;
					break;
				case 'shift':
					if (!actualModifiers.shift) return false;
					break;
				case 'mod':
					// 'mod' means Cmd on macOS, Ctrl elsewhere
					if (Platform.isMacOS) {
						if (!actualModifiers.cmd) return false;
					} else {
						if (!actualModifiers.ctrl) return false;
					}
					break;
			}
		}

		// Check that no unexpected modifiers are pressed
		const expectedCtrl = expectedModifiers.includes('ctrl') || 
			(!Platform.isMacOS && expectedModifiers.includes('mod'));
		const expectedCmd = expectedModifiers.includes('cmd') || expectedModifiers.includes('meta') ||
			(Platform.isMacOS && expectedModifiers.includes('mod'));
		const expectedAlt = expectedModifiers.includes('alt');
		const expectedShift = expectedModifiers.includes('shift');

		if (actualModifiers.ctrl !== expectedCtrl) return false;
		if (actualModifiers.cmd !== expectedCmd) return false;
		if (actualModifiers.alt !== expectedAlt) return false;
		if (actualModifiers.shift !== expectedShift) return false;

		return true;
	}

	/**
	 * Parse accelerator string into modifiers and key
	 */
	private parseAccelerator(accelerator: string): ParsedHotkey | null {
		if (!accelerator) return null;

		// Handle symbol modifiers without separators (e.g., ⌘N, ⌥ArrowLeft)
		const symbolPattern = /^([⌘⌥⇧⌃]+)(.+)$/;
		const symbolMatch = accelerator.match(symbolPattern);
		
		if (symbolMatch) {
			const [, symbolMods, key] = symbolMatch;
			if (!symbolMods || !key) return null;
			
			const modifiers = [];
			
			// Parse each symbol character
			for (const char of symbolMods) {
				switch (char) {
					case '⌘': modifiers.push('cmd'); break;
					case '⌥': modifiers.push('alt'); break;
					case '⇧': modifiers.push('shift'); break;
					case '⌃': modifiers.push('ctrl'); break;
				}
			}
			
			return { modifiers, key };
		}

		// Handle text modifiers with separators (e.g., Ctrl+Enter, Mod-N)
		const parts = accelerator.split(/[+\-]/);
		if (parts.length === 0) return null;

		const key = parts[parts.length - 1];
		if (!key) return null;
		
		const modifiers = parts.slice(0, -1);

		return { modifiers, key };
	}

	/**
	 * Normalize modifier names to standard format
	 */
	private normalizeModifiers(modifiers: string[]): string[] {
		return modifiers.map(mod => {
			const normalized = mod.toLowerCase();
			// Handle common variations
			switch (normalized) {
				case '⌘':
				case 'cmd':
				case 'command':
					return 'cmd';
				case '⌥':
				case 'option':
					return 'alt';
				case '⇧':
					return 'shift';
				case '⌃':
					return 'ctrl';
				default:
					return normalized;
			}
		});
	}

	/**
	 * Convert accelerator string to Obsidian Command hotkeys format
	 */
	static parseAccelToObsidianHotkeys(accelerator: string): Hotkey[] {
		if (!accelerator) return [];

		const manager = new HotkeyManager({});
		const parsed = manager.parseAccelerator(accelerator);
		if (!parsed) return [];

		// Convert to Obsidian's expected format
		const obsidianModifiers: Modifier[] = parsed.modifiers.map(mod => {
			const normalized = mod.toLowerCase();
			switch (normalized) {
				case '⌘':
				case 'cmd':
				case 'command':
					return 'Cmd' as Modifier;
				case '⌥':
				case 'alt':
				case 'option':
					return 'Alt' as Modifier;
				case '⇧':
				case 'shift':
					return 'Shift' as Modifier;
				case '⌃':
				case 'ctrl':
					return 'Ctrl' as Modifier;
				case 'mod':
					return 'Mod' as Modifier; // Obsidian handles this internally
				default:
					return mod as Modifier;
			}
		});

		return [{
			modifiers: obsidianModifiers,
			key: parsed.key.toLowerCase()
		}];
	}

	/**
	 * Get all actions for an accelerator (for debugging)
	 */
	getActionsForAccelerator(accelerator: string): string[] {
		const actions: string[] = [];
		for (const [action, accelerators] of this.actionMap.entries()) {
			if (accelerators.includes(accelerator)) {
				actions.push(action);
			}
		}
		return actions;
	}

	/**
	 * Get all accelerators for an action
	 */
	getAcceleratorsForAction(action: string): string[] {
		return this.actionMap.get(action) || [];
	}
}