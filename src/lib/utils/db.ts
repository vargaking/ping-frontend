import type { User } from '$lib/types/auth.types';
import type { Channel } from '$lib/types/channel.types';
import type { StoredMessage, StoredPost, ThreadSync } from '$lib/types/localHistory.types';
import type { Server } from '$lib/types/server.types';
import { messageWords } from '$lib/utils/searchText';
import { timestampMs } from '$lib/utils/messageContent';
import Dexie, { type DBCore, type EntityTable } from 'dexie';

export type AppDb = Dexie & {
	servers: EntityTable<Server>;
	channels: EntityTable<Channel>;
	messages: EntityTable<StoredMessage, 'id'>;
	users: EntityTable<User>;
	posts: EntityTable<StoredPost, 'id'>;
	threadSync: EntityTable<ThreadSync, 'key'>;
};

/**
 * Minimal in-memory stand-in for the slice of the Dexie API this app uses,
 * so the client still works when IndexedDB is unavailable (private mode, some
 * embedded webviews, SSR). Data lives only for the session — it is not persisted.
 */
class MemoryCollection<T extends Record<string, unknown>> {
	constructor(private rows: T[]) {}
	async toArray(): Promise<T[]> {
		return [...this.rows];
	}
	async first(): Promise<T | undefined> {
		return this.rows[0];
	}
	async sortBy(key: keyof T): Promise<T[]> {
		return [...this.rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
	}
}

class MemoryTable<T extends Record<string, unknown>> {
	private rows: T[] = [];
	constructor(private pk: keyof T) {}

	private upsert(item: T) {
		const i = this.rows.findIndex((r) => r[this.pk] === item[this.pk]);
		if (i >= 0) this.rows[i] = item;
		else this.rows.push(item);
	}

	async add(item: T): Promise<unknown> {
		this.rows.push(item);
		return item[this.pk];
	}
	async put(item: T): Promise<unknown> {
		this.upsert(item);
		return item[this.pk];
	}
	async bulkPut(items: T[]): Promise<void> {
		items.forEach((i) => this.upsert(i));
	}
	async get(key: T[keyof T]): Promise<T | undefined> {
		return this.rows.find((r) => r[this.pk] === key);
	}
	async update(key: T[keyof T], changes: Partial<T>): Promise<number> {
		const i = this.rows.findIndex((r) => r[this.pk] === key);
		if (i < 0) return 0;
		this.rows[i] = { ...this.rows[i], ...changes };
		return 1;
	}
	async delete(key: T[keyof T]): Promise<void> {
		this.rows = this.rows.filter((r) => r[this.pk] !== key);
	}
	async clear(): Promise<void> {
		this.rows = [];
	}

	where(criteria: keyof T | Partial<T>) {
		if (typeof criteria === 'object') {
			const filtered = this.rows.filter((r) =>
				Object.entries(criteria).every(([k, v]) => r[k as keyof T] === v)
			);
			return new MemoryCollection<T>(filtered);
		}
		const field = criteria;
		return {
			equals: (value: unknown) =>
				new MemoryCollection<T>(this.rows.filter((r) => r[field] === value))
		};
	}
}

function createMemoryDb(): AppDb {
	return {
		servers: new MemoryTable<Server>('id' as keyof Server),
		channels: new MemoryTable<Channel>('id'),
		messages: new MemoryTable<StoredMessage>('id'),
		users: new MemoryTable<User>('id'),
		posts: new MemoryTable<StoredPost>('id'),
		threadSync: new MemoryTable<ThreadSync>('key')
	} as unknown as AppDb;
}

function indexedDBAvailable(): boolean {
	try {
		return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
	} catch {
		return false;
	}
}

function withDerivedFields(message: StoredMessage): StoredMessage {
	return { ...message, ts: timestampMs(message.timestamp), words: messageWords(message) };
}

/** Every write to `messages` (add, put, and the update/modify calls built on put) gets
 *  fresh `ts` and `words`, so no call site has to know about them. */
function deriveMessageFields(down: DBCore): DBCore {
	return {
		...down,
		table(name) {
			const table = down.table(name);
			if (name !== 'messages') return table;
			return {
				...table,
				mutate(req) {
					if (req.type === 'add' || req.type === 'put') {
						return table.mutate({ ...req, values: req.values.map(withDerivedFields) });
					}
					return table.mutate(req);
				}
			};
		}
	};
}

export function createDexieDb(name = 'PingDatabase'): AppDb {
	const dexieDb = new Dexie(name) as AppDb;
	dexieDb.version(1).stores({
		servers: '++id, name, server_profile, server_settings',
		channels: '++id, server_id, name, channel_settings',
		messages: 'id, server_id, channel_id, user_id, content, timestamp',
		users: '++id, username, public_key, profile'
	});
	// v2 indexes conversation_id so DM messages can be read back per
	// conversation. Channel messages keep their server/channel indexes.
	dexieDb.version(2).stores({
		messages: 'id, server_id, channel_id, conversation_id, user_id, content, timestamp'
	});
	// v3 indexes post_id so a forum post's messages can be read back per post.
	dexieDb.version(3).stores({
		messages: 'id, server_id, channel_id, conversation_id, post_id, user_id, content, timestamp'
	});
	// v4 keeps a searchable copy of all readable history: messages gain `ts` and `words`
	// (see deriveMessageFields), forum posts get their own table, and threadSync records
	// how far each thread has been downloaded.
	dexieDb
		.version(4)
		.stores({
			messages:
				'id, server_id, channel_id, conversation_id, post_id, user_id, ts, *words, [server_id+ts], [channel_id+ts], [conversation_id+ts], [post_id+ts]',
			posts: 'id, channel_id, server_id, *words',
			threadSync: 'key, serverId, channelId'
		})
		.upgrade((tx) =>
			tx
				.table<StoredMessage>('messages')
				.toCollection()
				.modify((message) => {
					message.ts = timestampMs(message.timestamp);
					message.words = messageWords(message);
				})
		);
	dexieDb.use({ stack: 'dbcore', name: 'deriveMessageFields', create: deriveMessageFields });
	return dexieDb;
}

function createDb(): { db: AppDb; persistent: boolean } {
	if (indexedDBAvailable()) {
		try {
			return { db: createDexieDb(), persistent: true };
		} catch (e) {
			console.warn('IndexedDB unavailable — falling back to in-memory store.', e);
			return { db: createMemoryDb(), persistent: false };
		}
	}

	console.warn('IndexedDB unavailable — falling back to in-memory store.');
	return { db: createMemoryDb(), persistent: false };
}

const created = createDb();
const db = created.db;

/** False when the in-memory fallback is in use, where nothing is kept across reloads. */
export const localHistoryAvailable: boolean = created.persistent;

let ready: Promise<boolean> | null = null;

/** Whether the local history database can really be used; settles once and is cached. */
export function localHistoryReady(): Promise<boolean> {
	ready ??= localHistoryAvailable
		? db.open().then(
				() => true,
				() => false
			)
		: Promise.resolve(false);
	return ready;
}

/** Wipe every locally cached table. Used when tearing down a session (logout,
 *  or a 401 that means the session is gone) so no data leaks to the next user. */
export async function clearLocalCache(): Promise<void> {
	await Promise.all([
		db.servers.clear(),
		db.channels.clear(),
		db.messages.clear(),
		db.users.clear(),
		db.posts.clear(),
		db.threadSync.clear()
	]);
}

export { db };
