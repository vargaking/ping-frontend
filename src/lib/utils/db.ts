import type { User } from '$lib/types/auth.types';
import type { Channel } from '$lib/types/channel.types';
import type { MessageType } from '$lib/types/messages.types';
import type { Server } from '$lib/types/server.types';
import Dexie, { type EntityTable } from 'dexie';

type AppDb = Dexie & {
	servers: EntityTable<Server>;
	channels: EntityTable<Channel>;
	messages: EntityTable<MessageType, 'id'>;
	users: EntityTable<User>;
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
		messages: new MemoryTable<MessageType>('id'),
		users: new MemoryTable<User>('id')
	} as unknown as AppDb;
}

function indexedDBAvailable(): boolean {
	try {
		return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
	} catch {
		return false;
	}
}

function createDb(): AppDb {
	if (indexedDBAvailable()) {
		try {
			const dexieDb = new Dexie('PingDatabase') as AppDb;
			dexieDb.version(1).stores({
				servers: '++id, name, server_profile, server_settings',
				channels: '++id, server_id, name, channel_settings',
				messages: 'id, server_id, channel_id, user_id, content, timestamp',
				users: '++id, username, public_key, profile'
			});
			return dexieDb;
		} catch (e) {
			console.warn('IndexedDB unavailable — falling back to in-memory store.', e);
			return createMemoryDb();
		}
	}

	console.warn('IndexedDB unavailable — falling back to in-memory store.');
	return createMemoryDb();
}

const db = createDb();

/** Wipe every locally cached table. Used when tearing down a session (logout,
 *  or a 401 that means the session is gone) so no data leaks to the next user. */
export async function clearLocalCache(): Promise<void> {
	await Promise.all([
		db.servers.clear(),
		db.channels.clear(),
		db.messages.clear(),
		db.users.clear()
	]);
}

export { db };
