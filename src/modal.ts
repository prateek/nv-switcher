// ABOUTME: nv-switcher modal placeholder for search and file switching interface
// ABOUTME: Will be implemented in future tasks - currently provides stub for commands integration

import { App, Modal } from 'obsidian';
import { HotkeyManager } from './hotkey-manager';
import type NvSwitcherPlugin from './plugin';

export class NvModal extends Modal {
	plugin: NvSwitcherPlugin;
	hotkeyManager: HotkeyManager | null = null;

	constructor(app: App, plugin: NvSwitcherPlugin) {
		super(app);
		this.plugin = plugin;
		this.hotkeyManager = plugin.getHotkeyManager();
		
		// Set up modal properties
		this.modalEl.addClass('nv-switcher-modal');
		this.contentEl.addClass('nv-switcher-content');
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'nv-switcher' });
		this.contentEl.createEl('p', { 
			text: 'Modal implementation coming in future tasks. Press Escape to close.' 
		});

		// Set up keyboard event handling
		this.setupKeyboardHandlers();
	}

	onClose() {
		this.contentEl.empty();
		this.cleanup();
	}

	private setupKeyboardHandlers() {
		// Add keydown listener for hotkey handling
		this.modalEl.addEventListener('keydown', this.handleKeydown.bind(this));
	}

	private handleKeydown(evt: KeyboardEvent) {
		if (!this.hotkeyManager) return;

		// Handle escape to close
		if (this.hotkeyManager.is('close', evt)) {
			evt.preventDefault();
			this.close();
			return;
		}

		// Handle other modal actions (placeholders for future implementation)
		if (this.hotkeyManager.is('moveUp', evt)) {
			evt.preventDefault();
			this.handleMoveUp();
			return;
		}

		if (this.hotkeyManager.is('moveDown', evt)) {
			evt.preventDefault();
			this.handleMoveDown();
			return;
		}

		if (this.hotkeyManager.is('open', evt)) {
			evt.preventDefault();
			this.handleOpen(false);
			return;
		}

		if (this.hotkeyManager.is('openInSplit', evt)) {
			evt.preventDefault();
			this.handleOpen(true);
			return;
		}

		if (this.hotkeyManager.is('forceCreate', evt)) {
			evt.preventDefault();
			this.handleForceCreate();
			return;
		}

		if (this.hotkeyManager.is('focusPreview', evt)) {
			evt.preventDefault();
			this.handleFocusPreview();
			return;
		}

		if (this.hotkeyManager.is('cycleLeft', evt)) {
			evt.preventDefault();
			this.handleCycleLeft();
			return;
		}

		if (this.hotkeyManager.is('cycleRight', evt)) {
			evt.preventDefault();
			this.handleCycleRight();
			return;
		}
	}

	private handleMoveUp() {
		console.log('Move up (placeholder)');
		// TODO: Implement navigation up in search results
	}

	private handleMoveDown() {
		console.log('Move down (placeholder)');
		// TODO: Implement navigation down in search results
	}

	private handleOpen(inSplit: boolean) {
		console.log(`Open ${inSplit ? 'in split' : 'in current leaf'} (placeholder)`);
		// TODO: Implement file opening
		
		if (inSplit) {
			// Example: this.plugin.openFileInSplit(selectedFilePath);
		} else {
			// Example: this.plugin.openFile(selectedFilePath);
		}
		
		this.close();
	}

	private handleForceCreate() {
		console.log('Force create (placeholder)');
		// TODO: Implement force create new file
		this.close();
	}

	private handleFocusPreview() {
		console.log('Focus preview (placeholder)');
		// TODO: Implement preview focus
	}

	private handleCycleLeft() {
		console.log('Cycle left (placeholder)');
		// TODO: Implement cycling left through preview modes
	}

	private handleCycleRight() {
		console.log('Cycle right (placeholder)');
		// TODO: Implement cycling right through preview modes
	}

	private cleanup() {
		// Remove event listeners if needed
		this.modalEl.removeEventListener('keydown', this.handleKeydown.bind(this));
	}
}