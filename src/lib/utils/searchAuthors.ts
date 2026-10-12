import Dexie from 'dexie';
import type { User } from '$lib/types/auth.types';
import { db } from '$lib/utils/db';
import { fromKeysForName } from '$lib/utils/messageSearch';
import { normalizeName } from '$lib/utils/searchFacets';

/** Past this many matching authors a typed prefix falls back to the exact name, so one
 *  letter doesn't turn into a walk over hundreds of author ranges. */
export const PREFIX_KEY_LIMIT = 20;

export type ImportedName = {
	/** `name:` plus the normalized name. */
	key: string;
	/** As the oldest message shows it. */
	name: string;
};

export type AuthorScan = { userIds: number[]; imported: ImportedName[] };

export const EMPTY_SCAN: AuthorScan = { userIds: [], imported: [] };

/** Every author key in the local history, one row read each: read the first key, then jump
 *  past it. Imported authors with the same name share a key. */
export async function scanStoredAuthors(): Promise<AuthorScan> {
	const scan: AuthorScan = { userIds: [], imported: [] };
	let row = await db.messages.orderBy('[fromKey+ts]').first();
	while (row?.fromKey) {
		const key = row.fromKey;
		if (key.startsWith('user:')) scan.userIds.push(Number(key.slice(5)));
		else if (key.startsWith('name:')) {
			scan.imported.push({ key, name: row.imported_author?.name ?? key.slice(5) });
		}
		row = await db.messages.where('[fromKey+ts]').above([key, Dexie.maxKey]).first();
	}
	return scan;
}

export type AuthorEntry = {
	key: string;
	name: string;
	norm: string;
	source: 'member' | 'user' | 'imported';
};

function entry(key: string, name: string, source: AuthorEntry['source']): AuthorEntry {
	return { key, name, norm: normalizeName(name), source };
}

const byName = (a: AuthorEntry, b: AuthorEntry) =>
	a.norm < b.norm ? -1 : a.norm > b.norm ? 1 : a.name.localeCompare(b.name);

/** Who `from:` suggests: the scoped members first, then everyone else in the history. Users
 *  whose profile isn't loaded yet are left out until it arrives. */
export function authorPool(
	scan: AuthorScan,
	members: User[],
	users: Record<number, User>
): AuthorEntry[] {
	const seen = new Set<string>();
	const add = (list: AuthorEntry[], item: AuthorEntry) => {
		if (seen.has(item.key)) return;
		seen.add(item.key);
		list.push(item);
	};

	const first: AuthorEntry[] = [];
	for (const member of members) {
		const user = users[member.id] ?? member;
		add(first, entry(`user:${user.id}`, user.username, 'member'));
	}

	const others: AuthorEntry[] = [];
	for (const id of scan.userIds) {
		const user = users[id];
		if (user) add(others, entry(`user:${id}`, user.username, 'user'));
	}
	for (const { key, name } of scan.imported) add(others, entry(key, name, 'imported'));

	return [...first.sort(byName), ...others.sort(byName)];
}

/** The keys of a complete name, or null when nobody in the history has it. */
export function exactAuthorKeys(
	name: string,
	imported: ImportedName[],
	users: Iterable<User>
): string[] | null {
	const keys = fromKeysForName(name, users);
	const known =
		keys.some((key) => key.startsWith('user:')) || imported.some((item) => item.key === keys[0]);
	return known ? keys : null;
}

/** The keys of every author whose name starts with `prefix`. The typed name itself is always
 *  in, so an author who arrived after the scan is still found by their full name. */
export function prefixAuthorKeys(
	prefix: string,
	imported: ImportedName[],
	storedUsers: User[]
): string[] {
	const typed = `name:${prefix}`;
	const matches = new Set<string>();
	for (const item of imported) {
		if (item.key.slice(5).startsWith(prefix)) matches.add(item.key);
	}
	for (const user of storedUsers) {
		if (normalizeName(user.username).startsWith(prefix)) matches.add(`user:${user.id}`);
	}
	matches.delete(typed);
	if (matches.size > PREFIX_KEY_LIMIT) return fromKeysForName(prefix, storedUsers);
	return [typed, ...matches];
}
