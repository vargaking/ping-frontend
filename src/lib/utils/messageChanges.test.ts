import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageChangesPage } from '$lib/requests/messages/getMessageChanges';
import type { MessageType } from '$lib/types/messages.types';
import { clearLocalCache, db } from './db';
import {
	applyMessageChanges,
	readCursor,
	removeCursor,
	resetLocalHistory,
	writeCursor,
	type ChangesSource
} from './messageChanges';

const handlers = vi.hoisted(() => ({
	updated: vi.fn(),
	deleted: vi.fn()
}));

// Same database effects as the real handlers; the rest of what they do is theirs to test.
vi.mock('$lib/states/socketState.svelte', async () => {
	const { db } = await import('./db');
	return {
		socketState: {
			async handleMessageUpdated(message: MessageType) {
				handlers.updated(message.id);
				await db.messages.update(message.id, {
					content: message.content,
					edited_at: message.edited_at
				});
			},
			async handleMessageDeleted(message: { id: string }) {
				handlers.deleted(message.id);
				await db.messages.delete(message.id);
			}
		}
	};
});

const USER = 7;

const doc = (text: string) =>
	({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }) as never;

const message = (id: string, text: string, extra: Partial<MessageType> = {}): MessageType => ({
	id,
	user_id: 1,
	content: doc(text),
	timestamp: '2025-03-01T10:00:00Z',
	server_id: 1,
	channel_id: 10,
	...extra
});

const edited = (id: string) => ({ id, kind: 'edited' as const, at: '2025-03-02T00:00:00Z' });
const deleted = (id: string) => ({ id, kind: 'deleted' as const, at: '2025-03-02T00:00:00Z' });

function pageOf(
	changes: MessageChangesPage['changes'],
	cursor: string,
	extra: Partial<MessageChangesPage> = {}
): MessageChangesPage {
	return { reset: false, changes, cursor, has_more: false, ...extra };
}

/** A scripted feed: answers the pages in order and serves lookups from `current`. */
function feed(pages: (MessageChangesPage | Error)[], current: MessageType[] = []) {
	const sinces: (string | undefined)[] = [];
	const lookups: string[][] = [];
	const source: ChangesSource = {
		async page(since) {
			sinces.push(since);
			const next = pages[sinces.length - 1];
			if (next instanceof Error) throw next;
			return next;
		},
		async byIds(ids) {
			lookups.push(ids);
			return current.filter((m) => ids.includes(m.id));
		}
	};
	return { source, sinces, lookups };
}

let storage: Map<string, string>;

function installStorage() {
	storage = new Map();
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => void storage.set(key, value),
			removeItem: (key: string) => void storage.delete(key)
		}
	});
}

beforeEach(async () => {
	installStorage();
	handlers.updated.mockClear();
	handlers.deleted.mockClear();
	await clearLocalCache();
});

afterEach(() => {
	Reflect.deleteProperty(globalThis, 'localStorage');
});

const storedIds = async () => (await db.messages.toArray()).map((m) => m.id).sort();

describe('cursor storage', () => {
	it('keeps one cursor per user', () => {
		writeCursor(1, 'a');
		writeCursor(2, 'b');

		expect(storage.get('historyChangesCursor:1')).toBe('a');
		expect(readCursor(1)).toBe('a');
		expect(readCursor(2)).toBe('b');
		removeCursor(1);
		expect(readCursor(1)).toBeNull();
		expect(readCursor(2)).toBe('b');
	});

	it('behaves as no cursor when storage is unavailable', () => {
		Reflect.deleteProperty(globalThis, 'localStorage');

		expect(() => writeCursor(1, 'a')).not.toThrow();
		expect(() => removeCursor(1)).not.toThrow();
		expect(readCursor(1)).toBeNull();
	});
});

describe('without a cursor', () => {
	it('asks once for one and stores it, touching no message', async () => {
		await db.messages.bulkPut([message('a', 'one'), message('b', 'two')]);
		const { source, sinces, lookups } = feed([pageOf([], 'fresh')]);

		await applyMessageChanges(USER, source);

		expect(sinces).toEqual([undefined]);
		expect(readCursor(USER)).toBe('fresh');
		expect(lookups).toEqual([]);
		expect(handlers.deleted).not.toHaveBeenCalled();
		expect(await storedIds()).toEqual(['a', 'b']);
	});
});

describe('with a cursor', () => {
	beforeEach(() => writeCursor(USER, 'c0'));

	it('deletes, updates and re-derives the search words of what changed', async () => {
		await db.messages.bulkPut([
			message('gone', 'removed'),
			message('edit', 'before'),
			message('same', 'untouched')
		]);
		const { source, sinces } = feed(
			[pageOf([deleted('gone'), edited('edit')], 'c1')],
			[message('edit', 'after', { edited_at: '2025-03-02T00:00:00Z' })]
		);

		await applyMessageChanges(USER, source);

		expect(sinces).toEqual(['c0']);
		expect(await storedIds()).toEqual(['edit', 'same']);
		const row = await db.messages.get('edit');
		expect(row?.edited_at).toBe('2025-03-02T00:00:00Z');
		expect(row?.words).toEqual(['after']);
		expect(readCursor(USER)).toBe('c1');
	});

	it('drops an edited message the lookup does not return', async () => {
		await db.messages.bulkPut([message('hidden', 'secret'), message('kept', 'text')]);
		const { source } = feed(
			[pageOf([edited('hidden'), edited('kept')], 'c1')],
			[message('kept', 'text now')]
		);

		await applyMessageChanges(USER, source);

		expect(await storedIds()).toEqual(['kept']);
		expect(handlers.deleted).toHaveBeenCalledExactlyOnceWith('hidden');
	});

	it.each([
		['edited, then deleted', [edited('x'), deleted('x')]],
		['deleted, then edited', [deleted('x'), edited('x')]]
	])('ends deleted for a message %s in one page', async (_name, changes) => {
		await db.messages.put(message('x', 'text'));
		const { source, lookups } = feed([pageOf(changes, 'c1')], [message('x', 'newer')]);

		await applyMessageChanges(USER, source);

		expect(await storedIds()).toEqual([]);
		expect(lookups).toEqual([]);
		expect(handlers.updated).not.toHaveBeenCalled();
	});

	it('skips messages it does not hold', async () => {
		await db.messages.put(message('held', 'text'));
		const { source, lookups } = feed([pageOf([deleted('nope'), edited('nope-too')], 'c1')]);

		await applyMessageChanges(USER, source);

		expect(handlers.deleted).not.toHaveBeenCalled();
		expect(handlers.updated).not.toHaveBeenCalled();
		expect(lookups).toEqual([]);
		expect(await storedIds()).toEqual(['held']);
		expect(readCursor(USER)).toBe('c1');
	});

	it('looks edited messages up in chunks of 100', async () => {
		const ids = Array.from({ length: 250 }, (_, i) => `m${i}`);
		await db.messages.bulkPut(ids.map((id) => message(id, 'old')));
		const { source, lookups } = feed(
			[pageOf(ids.map(edited), 'c1')],
			ids.map((id) => message(id, 'new'))
		);

		await applyMessageChanges(USER, source);

		expect(lookups.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
		expect(handlers.updated).toHaveBeenCalledTimes(250);
	});

	it('stores the cursor after each page', async () => {
		await db.messages.bulkPut([message('a', 'one'), message('b', 'two')]);
		const stored: (string | null)[] = [];
		const { source, sinces } = feed([
			pageOf([deleted('a')], 'c1', { has_more: true }),
			pageOf([deleted('b')], 'c2')
		]);
		const page = source.page;
		source.page = async (since) => {
			stored.push(readCursor(USER));
			return page(since);
		};

		await applyMessageChanges(USER, source);

		expect(sinces).toEqual(['c0', 'c1']);
		expect(stored).toEqual(['c0', 'c1']);
		expect(readCursor(USER)).toBe('c2');
		expect(await storedIds()).toEqual([]);
	});

	it.each([
		['the next page cannot be fetched', new Error('offline')],
		['a lookup fails', pageOf([edited('b')], 'c2')]
	])('keeps the last stored cursor when %s', async (_name, second) => {
		await db.messages.bulkPut([message('a', 'one'), message('b', 'two')]);
		const { source } = feed([pageOf([deleted('a')], 'c1', { has_more: true }), second]);
		source.byIds = async () => {
			throw new Error('offline');
		};

		await expect(applyMessageChanges(USER, source)).rejects.toThrow('offline');

		expect(readCursor(USER)).toBe('c1');
		expect(await storedIds()).toEqual(['b']);
	});

	it('keeps the cursor when a handler throws', async () => {
		await db.messages.put(message('a', 'one'));
		handlers.deleted.mockImplementationOnce(() => {
			throw new Error('handler failed');
		});
		const { source } = feed([pageOf([deleted('a')], 'c1')]);

		await expect(applyMessageChanges(USER, source)).rejects.toThrow('handler failed');

		expect(readCursor(USER)).toBe('c0');
	});

	it('gives up on a feed that claims more without moving', async () => {
		const { source, sinces } = feed([pageOf([], 'c0', { has_more: true })]);

		await expect(applyMessageChanges(USER, source)).rejects.toThrow();

		expect(sinces).toEqual(['c0']);
		expect(readCursor(USER)).toBe('c0');
	});

	it('clears the downloaded history on reset and stores the fresh cursor', async () => {
		await db.messages.put(message('a', 'one'));
		await db.posts.put({ id: 5, channel_id: 10, server_id: 1, words: [] } as never);
		await db.threadSync.put({ key: '10', head: [], marker: 'a', complete: true } as never);
		await db.servers.put({ id: 1, name: 'one' } as never);
		const { source, sinces } = feed([pageOf([], 'fresh', { reset: true })]);

		await applyMessageChanges(USER, source);

		expect(sinces).toEqual(['c0']);
		expect(await db.messages.count()).toBe(0);
		expect(await db.posts.count()).toBe(0);
		expect(await db.threadSync.count()).toBe(0);
		expect(await db.servers.count()).toBe(1);
		expect(readCursor(USER)).toBe('fresh');
	});
});

describe('resetLocalHistory', () => {
	it('empties messages, posts and sync rows only', async () => {
		await db.messages.put(message('a', 'one'));
		await db.channels.put({ id: 10, name: 'general' } as never);

		await resetLocalHistory();

		expect(await db.messages.count()).toBe(0);
		expect(await db.channels.count()).toBe(1);
	});
});
