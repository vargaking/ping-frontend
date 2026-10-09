import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MessageType } from '$lib/types/messages.types';
import { clearLocalCache, createDexieDb, db, localHistoryAvailable } from './db';

const doc = (value: string) =>
	({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }]
	}) as never;

function message(id: string, content: string, extra: Partial<MessageType> = {}): MessageType {
	return {
		id,
		user_id: 1,
		content: doc(content),
		timestamp: '2025-03-01T10:00:00Z',
		server_id: 1,
		channel_id: 10,
		...extra
	};
}

beforeEach(async () => {
	await clearLocalCache();
});

describe('message store', () => {
	it('uses the real database', () => {
		expect(localHistoryAvailable).toBe(true);
	});

	it('derives ts and words on put', async () => {
		await db.messages.put(message('a', 'Árvíztűrő tükörfúrógép'));
		const row = await db.messages.get('a');
		expect(row?.ts).toBe(Date.parse('2025-03-01T10:00:00Z'));
		expect(row?.words).toEqual(['arvizturo', 'tukorfurogep']);
	});

	it('derives them on add', async () => {
		await db.messages.add(message('a', 'hello there'));
		expect((await db.messages.get('a'))?.words).toEqual(['hello', 'there']);
	});

	it('treats a timestamp without an offset as UTC', async () => {
		await db.messages.put(message('a', 'x1', { timestamp: '2025-03-01T10:00:00' }));
		expect((await db.messages.get('a'))?.ts).toBe(Date.parse('2025-03-01T10:00:00Z'));
	});

	it('re-derives when a put replaces an existing row', async () => {
		await db.messages.put(message('a', 'first draft'));
		await db.messages.put(message('a', 'second version', { timestamp: '2025-03-02T10:00:00Z' }));
		const row = await db.messages.get('a');
		expect(row?.words).toEqual(['second', 'version']);
		expect(row?.ts).toBe(Date.parse('2025-03-02T10:00:00Z'));
		expect(await db.messages.count()).toBe(1);
	});

	it('derives on bulkPut', async () => {
		await db.messages.bulkPut([message('a', 'alpha beta'), message('b', 'gamma delta')]);
		expect((await db.messages.get('a'))?.words).toEqual(['alpha', 'beta']);
		expect((await db.messages.get('b'))?.words).toEqual(['gamma', 'delta']);
	});

	it('re-derives words when update changes the content', async () => {
		await db.messages.put(message('a', 'before edit'));
		await db.messages.update('a', { content: doc('after edit') });
		expect((await db.messages.get('a'))?.words).toEqual(['after', 'edit']);
	});

	it('re-derives ts when update changes the timestamp', async () => {
		await db.messages.put(message('a', 'hello'));
		await db.messages.update('a', { timestamp: '2025-04-01T00:00:00Z' });
		expect((await db.messages.get('a'))?.ts).toBe(Date.parse('2025-04-01T00:00:00Z'));
	});

	it('keeps ts and words right when update touches other fields', async () => {
		await db.messages.put(message('a', 'react to me'));
		await db.messages.update('a', { reactions: [{ emoji: '👍', user_ids: [2] }] });
		const row = await db.messages.get('a');
		expect(row?.reactions).toEqual([{ emoji: '👍', user_ids: [2] }]);
		expect(row?.words).toEqual(['react', 'to', 'me']);
		expect(row?.ts).toBe(Date.parse('2025-03-01T10:00:00Z'));
	});

	it('derives for Collection.modify with a function', async () => {
		await db.messages.bulkPut([message('a', 'one two'), message('b', 'three four')]);
		await db.messages.toCollection().modify((m) => {
			m.content = doc('rewritten text');
		});
		expect((await db.messages.get('a'))?.words).toEqual(['rewritten', 'text']);
		expect((await db.messages.get('b'))?.words).toEqual(['rewritten', 'text']);
	});

	it('derives for Collection.modify with a change object', async () => {
		await db.messages.put(message('a', 'one two'));
		await db.messages
			.where('id')
			.equals('a')
			.modify({ content: doc('changed words') });
		expect((await db.messages.get('a'))?.words).toEqual(['changed', 'words']);
	});

	it('derives for writes inside a transaction', async () => {
		await db.transaction('rw', db.messages, async () => {
			await db.messages.bulkPut([message('a', 'inside transaction')]);
		});
		expect((await db.messages.get('a'))?.words).toEqual(['inside', 'transaction']);
	});

	it('does not mutate the object it was given', async () => {
		const original = message('a', 'keep me clean');
		const snapshot = structuredClone(original);
		await db.messages.put(original);
		await db.messages.bulkPut([original]);
		await db.messages.update('a', { content: doc('changed') });
		expect(original).toEqual(snapshot);
		expect('words' in original).toBe(false);
		expect('ts' in original).toBe(false);
	});

	it('finds accented messages by an unaccented prefix', async () => {
		await db.messages.bulkPut([message('a', 'Árvíztűrő'), message('b', 'something else')]);
		const found = await db.messages.where('words').startsWith('arv').toArray();
		expect(found.map((m) => m.id)).toEqual(['a']);
	});

	it('orders a thread by ts through the compound index', async () => {
		await db.messages.bulkPut([
			message('late', 'late one', { timestamp: '2025-03-03T00:00:00Z' }),
			message('early', 'early one', { timestamp: '2025-03-01T00:00:00Z' }),
			message('other', 'other channel', { channel_id: 11, timestamp: '2025-03-02T00:00:00Z' })
		]);
		const rows = await db.messages
			.where('[channel_id+ts]')
			.between([10, Dexie.minKey], [10, Dexie.maxKey])
			.toArray();
		expect(rows.map((m) => m.id)).toEqual(['early', 'late']);
	});

	it('clears the new tables with the cache', async () => {
		await db.threadSync.put({
			key: '10',
			serverId: 1,
			channelId: 10,
			head: [],
			marker: null,
			olderCursor: null,
			complete: false
		});
		await clearLocalCache();
		expect(await db.threadSync.count()).toBe(0);
	});
});

describe('upgrade from version 3', () => {
	it('derives ts and words for rows that already exist', async () => {
		const name = 'UpgradeFromV3';
		const old = new Dexie(name);
		old.version(1).stores({
			servers: '++id, name, server_profile, server_settings',
			channels: '++id, server_id, name, channel_settings',
			messages: 'id, server_id, channel_id, user_id, content, timestamp',
			users: '++id, username, public_key, profile'
		});
		old.version(2).stores({
			messages: 'id, server_id, channel_id, conversation_id, user_id, content, timestamp'
		});
		old.version(3).stores({
			messages: 'id, server_id, channel_id, conversation_id, post_id, user_id, content, timestamp'
		});
		await old
			.table('messages')
			.bulkAdd([
				message('a', 'Árvíztűrő tükörfúrógép'),
				message('b', 'no timestamp offset', { timestamp: '2024-12-31T23:59:59' })
			]);
		old.close();

		const upgraded = createDexieDb(name);
		const a = await upgraded.messages.get('a');
		const b = await upgraded.messages.get('b');
		expect(a?.words).toEqual(['arvizturo', 'tukorfurogep']);
		expect(a?.ts).toBe(Date.parse('2025-03-01T10:00:00Z'));
		expect(b?.ts).toBe(Date.parse('2024-12-31T23:59:59Z'));
		expect(await upgraded.messages.where('words').startsWith('arv').count()).toBe(1);
		expect(await upgraded.posts.count()).toBe(0);
		upgraded.close();
	});
});
