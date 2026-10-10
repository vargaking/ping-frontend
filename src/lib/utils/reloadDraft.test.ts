import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { RELOAD_DRAFT_MAX_AGE_MS, saveReloadDraft, takeReloadDraft } from './reloadDraft';

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

describe('reload draft', () => {
	it('returns a saved draft once for its thread', () => {
		const storage = memoryStorage();
		saveReloadDraft(storage, { threadKey: 'channel:1', content, savedAt: 1000 });

		expect(takeReloadDraft(storage, 'channel:1', 2000)).toEqual(content);
		expect(takeReloadDraft(storage, 'channel:1', 2000)).toBeNull();
	});

	it('leaves another thread draft for its own composer', () => {
		const storage = memoryStorage();
		saveReloadDraft(storage, { threadKey: 'channel:1', content, savedAt: 1000 });

		expect(takeReloadDraft(storage, 'channel:2', 2000)).toBeNull();
		expect(takeReloadDraft(storage, 'channel:1', 2000)).toEqual(content);
	});

	it('drops an expired draft', () => {
		const storage = memoryStorage();
		saveReloadDraft(storage, { threadKey: 'channel:1', content, savedAt: 1000 });

		expect(takeReloadDraft(storage, 'channel:1', 1000 + RELOAD_DRAFT_MAX_AGE_MS)).toBeNull();
		expect(storage.data.size).toBe(0);
	});

	it('drops an expired draft for another thread too', () => {
		const storage = memoryStorage();
		saveReloadDraft(storage, { threadKey: 'channel:1', content, savedAt: 1000 });

		expect(takeReloadDraft(storage, 'channel:2', 1000 + RELOAD_DRAFT_MAX_AGE_MS)).toBeNull();
		expect(storage.data.size).toBe(0);
	});

	it('clears the stored draft when saving null', () => {
		const storage = memoryStorage();
		saveReloadDraft(storage, { threadKey: 'channel:1', content, savedAt: 1000 });
		saveReloadDraft(storage, null);

		expect(takeReloadDraft(storage, 'channel:1', 2000)).toBeNull();
		expect(storage.data.size).toBe(0);
	});

	it('yields null for a malformed entry and removes it', () => {
		const storage = memoryStorage();
		storage.data.set('reloadDraft', '{not json');
		expect(takeReloadDraft(storage, 'channel:1', 2000)).toBeNull();
		expect(storage.data.size).toBe(0);

		storage.data.set('reloadDraft', JSON.stringify({ threadKey: 'channel:1' }));
		expect(takeReloadDraft(storage, 'channel:1', 2000)).toBeNull();
		expect(storage.data.size).toBe(0);
	});

	it('does not throw when storage does', () => {
		const broken = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			},
			removeItem: () => {
				throw new Error('denied');
			}
		};

		expect(() =>
			saveReloadDraft(broken, { threadKey: 'channel:1', content, savedAt: 1000 })
		).not.toThrow();
		expect(() => saveReloadDraft(broken, null)).not.toThrow();
		expect(takeReloadDraft(broken, 'channel:1', 2000)).toBeNull();
	});

	it('does nothing without storage', () => {
		expect(() =>
			saveReloadDraft(null, { threadKey: 'channel:1', content, savedAt: 1000 })
		).not.toThrow();
		expect(takeReloadDraft(null, 'channel:1', 2000)).toBeNull();
	});
});
