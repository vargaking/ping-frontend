import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '$lib/types/auth.types';
import type { MessageType } from '$lib/types/messages.types';
import { clearLocalCache, db } from './db';
import {
	authorPool,
	EMPTY_SCAN,
	exactAuthorKeys,
	PREFIX_KEY_LIMIT,
	prefixAuthorKeys,
	scanStoredAuthors,
	type AuthorScan,
	type ImportedName
} from './searchAuthors';

const user = (id: number, username: string) => ({ id, username }) as User;

let clock = Date.parse('2025-03-01T10:00:00Z');

function message(id: string, extra: Partial<MessageType>): MessageType {
	clock += 60_000;
	return {
		id,
		user_id: 1,
		content: { type: 'doc', content: [] } as never,
		timestamp: new Date(clock).toISOString(),
		server_id: 1,
		channel_id: 10,
		...extra
	};
}

const imported = (id: string, name: string) => ({ imported_author: { id, name } });

beforeEach(async () => {
	await clearLocalCache();
	clock = Date.parse('2025-03-01T10:00:00Z');
});

describe('scanStoredAuthors', () => {
	it('finds each user and each imported name once, with the oldest display name', async () => {
		await db.messages.bulkPut([
			message('a', { user_id: 1 }),
			message('b', { user_id: 3 }),
			message('c', { user_id: 1, ...imported('x1', 'Dénes') }),
			message('d', { user_id: 1, ...imported('x2', 'DENES') }),
			message('e', { user_id: 1, ...imported('x3', 'Old Name') }),
			message('f', { user_id: 3 })
		]);

		const scan = await scanStoredAuthors();
		expect(scan.userIds.sort()).toEqual([1, 3]);
		expect(scan.imported).toEqual([
			{ key: 'name:denes', name: 'Dénes' },
			{ key: 'name:old name', name: 'Old Name' }
		]);
	});

	it('finds nothing in an empty history', async () => {
		expect(await scanStoredAuthors()).toEqual(EMPTY_SCAN);
	});
});

describe('authorPool', () => {
	const scan: AuthorScan = {
		userIds: [1, 2, 3, 4],
		imported: [
			{ key: 'name:denes', name: 'Dénes' },
			{ key: 'name:abel', name: 'Abel' }
		]
	};
	const users = { 1: user(1, 'zoe'), 2: user(2, 'Dani'), 3: user(3, 'eve') };

	it('puts the members first, each group by name', () => {
		const pool = authorPool(scan, [user(3, 'old'), user(1, 'zoe')], users);
		expect(pool.map((a) => [a.name, a.source])).toEqual([
			['eve', 'member'],
			['zoe', 'member'],
			['Abel', 'imported'],
			['Dani', 'user'],
			['Dénes', 'imported']
		]);
	});

	it('shows a member under the profile name that is loaded now', () => {
		expect(authorPool(EMPTY_SCAN, [user(1, 'old')], users)[0].name).toBe('zoe');
	});

	it('lists a user once, and skips one whose profile is not loaded', () => {
		const pool = authorPool(scan, [user(2, 'Dani')], users);
		expect(pool.filter((a) => a.key === 'user:2')).toHaveLength(1);
		expect(pool.some((a) => a.key === 'user:4')).toBe(false);
	});

	it('carries the normalized name', () => {
		expect(authorPool(scan, [], users).find((a) => a.name === 'Dénes')?.norm).toBe('denes');
	});
});

describe('exactAuthorKeys', () => {
	const names: ImportedName[] = [{ key: 'name:denes', name: 'Dénes' }];

	it.each<[string, string[] | null]>([
		['denes', ['name:denes']],
		['dani', ['name:dani', 'user:2']],
		['nobody', null]
	])('%s gives %j', (name, expected) => {
		expect(exactAuthorKeys(name, names, [user(2, 'Dáni')])).toEqual(expected);
	});
});

describe('prefixAuthorKeys', () => {
	const names: ImportedName[] = [
		{ key: 'name:denes', name: 'Dénes' },
		{ key: 'name:dora', name: 'Dora' },
		{ key: 'name:old name', name: 'Old Name' }
	];
	const stored = [user(2, 'Dáni'), user(3, 'bob')];

	it.each<[string, string[]]>([
		['den', ['name:den', 'name:denes']],
		['d', ['name:d', 'name:denes', 'name:dora', 'user:2']],
		['dani', ['name:dani', 'user:2']],
		['old n', ['name:old n', 'name:old name']],
		['denes', ['name:denes']],
		['zz', ['name:zz']]
	])('%s gives %j', (prefix, expected) => {
		expect(prefixAuthorKeys(prefix, names, stored)).toEqual(expected);
	});

	it('falls back to the exact name past the limit', () => {
		const many = Array.from({ length: PREFIX_KEY_LIMIT + 1 }, (_, i) => ({
			key: `name:d${i}`,
			name: `D${i}`
		}));
		expect(prefixAuthorKeys('d', many, [user(2, 'd')])).toEqual(['name:d', 'user:2']);
	});

	it('keeps the prefix keys at the limit', () => {
		const some = Array.from({ length: PREFIX_KEY_LIMIT }, (_, i) => ({
			key: `name:d${i}`,
			name: `D${i}`
		}));
		expect(prefixAuthorKeys('d', some, [])).toHaveLength(PREFIX_KEY_LIMIT + 1);
	});
});
