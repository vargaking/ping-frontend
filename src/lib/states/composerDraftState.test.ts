import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { ComposerDraftState, type OpenComposer } from './composerDraftState.svelte';

function memoryStorage() {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
		removeItem: (key: string) => void data.delete(key)
	};
}

const content: JSONContent = {
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'draft one' }] }]
};

function composer(fields: Partial<OpenComposer> = {}): OpenComposer {
	return {
		threadKey: () => 'channel:1',
		content: () => content,
		hasAttachments: () => false,
		...fields
	};
}

describe('ComposerDraftState', () => {
	it("saves the open composer's text under its thread key", () => {
		const storage = memoryStorage();
		const state = new ComposerDraftState(() => storage);
		state.register(composer());

		state.saveForReload(1000);

		expect(state.takeRestored('channel:1', 2000)).toEqual(content);
	});

	it('reads the thread key when saving, not when registering', () => {
		const storage = memoryStorage();
		const state = new ComposerDraftState(() => storage);
		let key = 'channel:1';
		state.register(composer({ threadKey: () => key }));
		key = 'channel:2';

		state.saveForReload(1000);

		expect(state.takeRestored('channel:1', 2000)).toBeUndefined();
		expect(state.takeRestored('channel:2', 2000)).toEqual(content);
	});

	it('saves nothing, and clears an old draft, with no composer open', () => {
		const storage = memoryStorage();
		const state = new ComposerDraftState(() => storage);
		const unregister = state.register(composer());
		state.saveForReload(1000);
		unregister();

		state.saveForReload(2000);

		expect(state.takeRestored('channel:1', 3000)).toBeUndefined();
	});

	it('saves nothing, and clears an old draft, when the editor is empty', () => {
		const storage = memoryStorage();
		const state = new ComposerDraftState(() => storage);
		let text: JSONContent | null = content;
		state.register(composer({ content: () => text }));
		state.saveForReload(1000);
		text = null;

		state.saveForReload(2000);

		expect(state.takeRestored('channel:1', 3000)).toBeUndefined();
	});

	it("doesn't let an older composer unregister a newer one", () => {
		const state = new ComposerDraftState(() => memoryStorage());
		const unregisterOld = state.register(composer({ hasAttachments: () => false }));
		state.register(composer({ hasAttachments: () => true }));

		unregisterOld();

		expect(state.hasUnsentAttachments).toBe(true);
	});

	it('reports unsent attachments from the open composer', () => {
		const state = new ComposerDraftState(() => memoryStorage());
		expect(state.hasUnsentAttachments).toBe(false);

		let attached = false;
		const unregister = state.register(composer({ hasAttachments: () => attached }));
		expect(state.hasUnsentAttachments).toBe(false);

		attached = true;
		expect(state.hasUnsentAttachments).toBe(true);

		unregister();
		expect(state.hasUnsentAttachments).toBe(false);
	});

	it('works without storage', () => {
		const state = new ComposerDraftState(() => null);
		state.register(composer());

		expect(() => state.saveForReload(1000)).not.toThrow();
		expect(state.takeRestored('channel:1', 2000)).toBeUndefined();
	});
});
