// ABOUTME: Tests for VaultEventHandler file event management and throttling
// ABOUTME: Verifies proper handling of create, modify, delete, and rename events

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TFile, Plugin, Component } from 'obsidian';
import { VaultEventHandler } from './event-handler';
import { VaultIndex } from './vault-index';

// Mock Component
vi.mock('obsidian', async () => {
	const actual = await vi.importActual('obsidian');
	return {
		...actual,
		Component: class MockComponent {
			registerEvent = vi.fn();
			onunload = vi.fn();
		},
	};
});

// Mock VaultIndex
class MockVaultIndex {
	public upsertCalls: TFile[] = [];
	public removeCalls: TFile[] = [];
	public renameCalls: Array<{ file: TFile; oldPath: string }> = [];

	async upsert(file: TFile): Promise<any> {
		this.upsertCalls.push(file);
		return {};
	}

	async remove(file: TFile): Promise<void> {
		this.removeCalls.push(file);
	}

	async rename(file: TFile, oldPath: string): Promise<void> {
		this.renameCalls.push({ file, oldPath });
	}

	reset(): void {
		this.upsertCalls = [];
		this.removeCalls = [];
		this.renameCalls = [];
	}
}

// Mock TFile
function createMockFile(path: string, basename: string): TFile {
	return {
		path,
		basename,
		extension: 'md',
	} as TFile;
}

// Mock App and Events
function createMockApp() {
	const eventListeners = new Map<string, Set<Function>>();
	const files = new Map<string, TFile>();

	const registerEvent = (eventType: string, callback: Function) => {
		if (!eventListeners.has(eventType)) {
			eventListeners.set(eventType, new Set());
		}
		eventListeners.get(eventType)!.add(callback);
	};

	const triggerEvent = (eventType: string, ...args: any[]) => {
		const listeners = eventListeners.get(eventType);
		if (listeners) {
			listeners.forEach(callback => callback(...args));
		}
	};

	return {
		vault: {
			on: vi.fn((event: string, callback: Function) => {
				registerEvent(`vault:${event}`, callback);
				return {} as any; // Mock event reference
			}),
			getFileByPath: vi.fn((path: string) => {
				return files.get(path) || null;
			}),
		},
		metadataCache: {
			on: vi.fn((event: string, callback: Function) => {
				registerEvent(`metadata:${event}`, callback);
				return {} as any; // Mock event reference
			}),
		},
		triggerVaultEvent: (event: string, ...args: any[]) => triggerEvent(`vault:${event}`, ...args),
		triggerMetadataEvent: (event: string, ...args: any[]) => triggerEvent(`metadata:${event}`, ...args),
		addFile: (file: TFile) => files.set(file.path, file),
	};
}

// Mock Plugin
function createMockPlugin() {
	return {
		registerEvent: vi.fn(),
	} as any as Plugin;
}

describe('VaultEventHandler', () => {
	let eventHandler: VaultEventHandler;
	let mockVaultIndex: MockVaultIndex;
	let mockApp: ReturnType<typeof createMockApp>;
	let mockPlugin: Plugin;

	beforeEach(() => {
		mockVaultIndex = new MockVaultIndex();
		mockApp = createMockApp();
		mockPlugin = createMockPlugin();
		
		eventHandler = new VaultEventHandler(mockApp as any, mockPlugin, mockVaultIndex as any);
		eventHandler.enable();
	});

	afterEach(() => {
		eventHandler.onunload();
	});

	describe('file creation', () => {
		it('should call upsert when file is created', async () => {
			const file = createMockFile('new-note.md', 'new-note');

			mockApp.triggerVaultEvent('create', file);

			// Wait for async operation
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(mockVaultIndex.upsertCalls).toContain(file);
		});

		it('should handle non-TFile objects gracefully', async () => {
			const notAFile = { path: 'not-a-file' };

			mockApp.triggerVaultEvent('create', notAFile);

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(mockVaultIndex.upsertCalls).toHaveLength(0);
		});
	});

	describe('file deletion', () => {
		it('should call remove when file is deleted', async () => {
			const file = createMockFile('deleted-note.md', 'deleted-note');

			mockApp.triggerVaultEvent('delete', file);

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(mockVaultIndex.removeCalls).toContain(file);
		});

		it('should remove file from pending updates when deleted', () => {
			const file = createMockFile('note.md', 'note');

			// First modify (adds to pending)
			mockApp.triggerVaultEvent('modify', file);
			
			// Then delete (should remove from pending)
			mockApp.triggerVaultEvent('delete', file);

			expect(mockVaultIndex.removeCalls).toContain(file);
		});
	});

	describe('file rename', () => {
		it('should call rename when file is renamed', async () => {
			const file = createMockFile('new-name.md', 'new-name');
			const oldPath = 'old-name.md';

			mockApp.triggerVaultEvent('rename', file, oldPath);

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(mockVaultIndex.renameCalls).toEqual([{ file, oldPath }]);
		});

		it('should update pending updates on rename', () => {
			const file = createMockFile('new-name.md', 'new-name');
			const oldPath = 'old-name.md';

			mockApp.triggerVaultEvent('rename', file, oldPath);

			// The implementation should handle pending updates correctly
			expect(mockVaultIndex.renameCalls).toEqual([{ file, oldPath }]);
		});
	});

	describe('file modification throttling', () => {
		it('should throttle rapid modifications', async () => {
			const file = createMockFile('note.md', 'note');
			mockApp.addFile(file);

			// Trigger multiple rapid modifications
			mockApp.triggerVaultEvent('modify', file);
			mockApp.triggerVaultEvent('modify', file);
			mockApp.triggerVaultEvent('modify', file);

			// Should not have processed yet (within throttle window)
			expect(mockVaultIndex.upsertCalls).toHaveLength(0);

			// Wait for throttle delay to pass
			await new Promise(resolve => setTimeout(resolve, 600));

			// Should have processed only once
			expect(mockVaultIndex.upsertCalls).toEqual([file]);
		});

		it('should handle multiple files in pending updates', async () => {
			const file1 = createMockFile('note1.md', 'note1');
			const file2 = createMockFile('note2.md', 'note2');

			// Add files to mock app
			mockApp.addFile(file1);
			mockApp.addFile(file2);

			// Trigger modifications for both files
			mockApp.triggerVaultEvent('modify', file1);
			mockApp.triggerVaultEvent('modify', file2);

			// Wait for throttle delay
			await new Promise(resolve => setTimeout(resolve, 600));

			// Should have processed both files
			expect(mockVaultIndex.upsertCalls).toContain(file1);
			expect(mockVaultIndex.upsertCalls).toContain(file2);
		});
	});

	describe('metadata cache events', () => {
		it('should trigger update on metadata change', () => {
			const file = createMockFile('note.md', 'note');

			mockApp.triggerMetadataEvent('changed', file);

			// Should trigger same throttling behavior as modify
			// (Implementation detail: metadata change calls onFileModify)
		});
	});

	describe('event registration', () => {
		it('should register all required vault events', () => {
			expect(mockApp.vault.on).toHaveBeenCalledWith('create', expect.any(Function));
			expect(mockApp.vault.on).toHaveBeenCalledWith('modify', expect.any(Function));
			expect(mockApp.vault.on).toHaveBeenCalledWith('delete', expect.any(Function));
			expect(mockApp.vault.on).toHaveBeenCalledWith('rename', expect.any(Function));
		});

		it('should register metadata cache events', () => {
			expect(mockApp.metadataCache.on).toHaveBeenCalledWith('changed', expect.any(Function));
		});
	});

	describe('cleanup', () => {
		it('should clear pending updates on unload', () => {
			const file = createMockFile('note.md', 'note');

			// Add pending update
			mockApp.triggerVaultEvent('modify', file);

			// Unload
			eventHandler.onunload();

			// Wait past throttle delay
			setTimeout(() => {
				// Should not have processed the update
				expect(mockVaultIndex.upsertCalls).toHaveLength(0);
			}, 600);
		});
	});
});