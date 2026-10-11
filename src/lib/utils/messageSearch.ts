import type { User } from '$lib/types/auth.types';
import type { StoredMessage, StoredPost } from '$lib/types/localHistory.types';
import { db } from '$lib/utils/db';
import { messagePlainText, timestampMs } from '$lib/utils/messageContent';
import {
	HAS_FIELD,
	normalizeName,
	postFromKey,
	type HasField,
	type HasKind
} from '$lib/utils/searchFacets';
import { normalizeText } from '$lib/utils/searchText';
import Dexie from 'dexie';

export type SearchScope =
	| { kind: 'everywhere' }
	| { kind: 'server'; serverId: number }
	| { kind: 'channel'; channelId: number }
	| { kind: 'post'; postId: number }
	| { kind: 'direct'; conversationId: number };

/** Match sets up to this size are loaded and sorted; bigger ones walk the time index. */
const SMALL_MATCH_SET = 500;
const WORD_SEPARATORS = /([^\p{L}\p{N}]+)/u;

/** Keys of every row with a word starting with each token. A multiEntry prefix query can
 *  return the same key more than once, so the result is a set. */
async function intersectPrefixes(
	table: 'messages' | 'posts',
	tokens: string[]
): Promise<Set<string | number>> {
	let matches: Set<string | number> | null = null;
	for (const token of [...tokens].sort((a, b) => b.length - a.length)) {
		const keys = await db[table].where('words').startsWith(token).primaryKeys();
		const found = new Set<string | number>(keys);
		if (matches) {
			for (const key of matches) if (!found.has(key)) matches.delete(key);
		} else {
			matches = found;
		}
		if (matches.size === 0) break;
	}
	return matches ?? new Set();
}

function inMessageScope(message: StoredMessage, scope: SearchScope): boolean {
	switch (scope.kind) {
		case 'everywhere':
			return true;
		case 'server':
			return message.server_id === scope.serverId;
		case 'channel':
			return message.channel_id === scope.channelId;
		case 'post':
			return message.post_id === scope.postId;
		case 'direct':
			return message.conversation_id === scope.conversationId;
	}
}

export type MessageFilters = {
	/** Every `fromKey` the author filter can mean; null when there is none. */
	fromKeys: string[] | null;
	has: HasKind[];
	/** Inclusive start in ms. */
	since: number | null;
	/** Exclusive end in ms. */
	until: number | null;
};

export const NO_FILTERS: MessageFilters = { fromKeys: null, has: [], since: null, until: null };

function isFiltered(f: MessageFilters): boolean {
	return f.fromKeys !== null || f.has.length > 0 || f.since !== null || f.until !== null;
}

type TimeIndex =
	| '[server_id+ts]'
	| '[channel_id+ts]'
	| '[post_id+ts]'
	| '[conversation_id+ts]'
	| '[fromKey+ts]'
	| `[${HasField}+ts]`;

/** Primary keys under one index value within the date window, oldest first (ties by id). */
function keysAscending(index: TimeIndex, value: string | number, f: MessageFilters) {
	return db.messages
		.where(index)
		.between([value, f.since ?? Dexie.minKey], [value, f.until ?? Dexie.maxKey], true, false)
		.primaryKeys();
}

function allKeysAscending(f: MessageFilters) {
	return db.messages
		.where('ts')
		.between(f.since ?? Dexie.minKey, f.until ?? Dexie.maxKey, true, false)
		.primaryKeys();
}

function scopeRange(scope: SearchScope): [TimeIndex, number] | null {
	switch (scope.kind) {
		case 'everywhere':
			return null;
		case 'server':
			return ['[server_id+ts]', scope.serverId];
		case 'channel':
			return ['[channel_id+ts]', scope.channelId];
		case 'post':
			return ['[post_id+ts]', scope.postId];
		case 'direct':
			return ['[conversation_id+ts]', scope.conversationId];
	}
}

function matchesRow(
	row: StoredMessage,
	scope: SearchScope,
	f: MessageFilters,
	words: Set<string> | null
): boolean {
	if (!inMessageScope(row, scope)) return false;
	const ts = row.ts ?? 0;
	if (f.since !== null && ts < f.since) return false;
	if (f.until !== null && ts >= f.until) return false;
	if (f.has.some((kind) => row[HAS_FIELD[kind]] !== 1)) return false;
	if (f.fromKeys && !(row.fromKey && f.fromKeys.includes(row.fromKey))) return false;
	return words === null || words.has(row.id);
}

async function rowsNewestFirst(
	ids: Iterable<string>,
	scope: SearchScope,
	f: MessageFilters,
	words: Set<string> | null
): Promise<string[]> {
	const rows = await db.messages.bulkGet([...ids]);
	return rows
		.filter((row): row is StoredMessage => row != null && matchesRow(row, scope, f, words))
		.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || (a.id < b.id ? 1 : -1))
		.map((row) => row.id);
}

/** Ids of every account with a stored message, including the shared account imported rows belong to. */
export async function storedUserIds(): Promise<number[]> {
	return (await db.messages.orderBy('user_id').uniqueKeys()) as number[];
}

/** Every `fromKey` a normalized `from:` name can mean: the imported author of that name, and
 *  each user whose username normalizes to it. */
export function fromKeysForName(name: string, users: Iterable<User>): string[] {
	const keys = [`name:${name}`];
	for (const user of users) {
		if (normalizeName(user.username) === name) keys.push(`user:${user.id}`);
	}
	return keys;
}

/** Ids of every stored message matching all tokens and filters within scope, newest first. */
export async function findMessageIds(
	tokens: string[],
	scope: SearchScope,
	filters: MessageFilters = NO_FILTERS
): Promise<string[]> {
	if (tokens.length === 0 && !isFiltered(filters)) return [];
	if (filters.fromKeys?.length === 0) return [];
	if (filters.since !== null && filters.until !== null && filters.since >= filters.until) return [];

	let words: Set<string> | null = null;
	if (tokens.length > 0) {
		words = (await intersectPrefixes('messages', tokens)) as Set<string>;
		if (words.size === 0) return [];
		if (words.size <= SMALL_MATCH_SET) return rowsNewestFirst(words, scope, filters, words);
	}

	const [hasLists, fromLists] = await Promise.all([
		Promise.all(filters.has.map((kind) => keysAscending(`[${HAS_FIELD[kind]}+ts]`, 1, filters))),
		Promise.all((filters.fromKeys ?? []).map((key) => keysAscending('[fromKey+ts]', key, filters)))
	]);
	if (hasLists.some((list) => list.length === 0)) return [];
	const fromNonEmpty = fromLists.filter((list) => list.length > 0);
	if (filters.fromKeys && fromNonEmpty.length === 0) return [];

	const ordered = [...hasLists];
	let fromUnion: Set<string> | null = null;
	if (fromNonEmpty.length === 1) ordered.push(fromNonEmpty[0]);
	else if (fromNonEmpty.length > 1) fromUnion = new Set(fromNonEmpty.flat());

	const candidates: (string[] | Set<string>)[] = [...ordered];
	if (fromUnion) candidates.push(fromUnion);
	if (words) candidates.push(words);
	if (candidates.length > 0) {
		const smallest = candidates.reduce((a, b) => (sizeOf(b) < sizeOf(a) ? b : a));
		if (sizeOf(smallest) <= SMALL_MATCH_SET)
			return rowsNewestFirst(smallest, scope, filters, words);
	}

	const range = scopeRange(scope);
	if (range) ordered.push(await keysAscending(range[0], range[1], filters));
	else if (ordered.length === 0) ordered.push(await allKeysAscending(filters));

	const source = ordered.reduce((a, b) => (b.length < a.length ? b : a));
	const others: Set<string>[] = ordered.filter((list) => list !== source).map((l) => new Set(l));
	if (fromUnion) others.push(fromUnion);
	if (words) others.push(words);
	return source.reverse().filter((id) => others.every((set) => set.has(id)));
}

function sizeOf(list: string[] | Set<string>): number {
	return Array.isArray(list) ? list.length : list.size;
}

/** Rows for ids, in the same order; ids no longer stored are skipped. */
export async function loadMessages(ids: string[]): Promise<StoredMessage[]> {
	const rows = await db.messages.bulkGet(ids);
	return rows.filter((row): row is StoredMessage => row != null);
}

function inPostScope(post: StoredPost, scope: SearchScope): boolean {
	switch (scope.kind) {
		case 'everywhere':
			return true;
		case 'server':
			return post.server_id === scope.serverId;
		case 'channel':
			return post.channel_id === scope.channelId;
		case 'post':
			return post.id === scope.postId;
		case 'direct':
			return false;
	}
}

/** Forum posts whose title matches all tokens, most recently active first. A post has no
 *  attachments or links of its own, so any `has:` filter excludes them all. */
export async function findPosts(
	tokens: string[],
	scope: SearchScope,
	limit = 5,
	filters: MessageFilters = NO_FILTERS
): Promise<StoredPost[]> {
	if (tokens.length === 0 || scope.kind === 'direct' || filters.has.length > 0) return [];
	const matches = await intersectPrefixes('posts', tokens);
	if (matches.size === 0) return [];
	const rows = await db.posts.bulkGet([...matches] as number[]);
	return rows
		.filter((row): row is StoredPost => row != null && inPostScope(row, scope))
		.filter((row) => postMatchesFilters(row, filters))
		.sort((a, b) => Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at))
		.slice(0, limit);
}

function postMatchesFilters(post: StoredPost, f: MessageFilters): boolean {
	if (f.fromKeys) {
		const key = postFromKey(post);
		if (key === null || !f.fromKeys.includes(key)) return false;
	}
	const created = timestampMs(post.created_at);
	return (f.since === null || created >= f.since) && (f.until === null || created < f.until);
}

export type TextPart = { text: string; hit: boolean };

function startsWithAny(word: string, tokens: string[]): boolean {
	return tokens.some((token) => word.startsWith(token));
}

/** One part per word or separator. */
function splitParts(text: string, tokens: string[]): TextPart[] {
	return text
		.split(WORD_SEPARATORS)
		.map((piece, i) => ({
			text: piece,
			// Odd pieces are the separators the split keeps.
			hit: i % 2 === 0 && piece !== '' && startsWithAny(normalizeText(piece), tokens)
		}))
		.filter((part) => part.text !== '');
}

/** Joins neighbouring parts that share a hit flag. */
function mergeParts(parts: TextPart[]): TextPart[] {
	const merged: TextPart[] = [];
	for (const part of parts) {
		const last = merged.at(-1);
		if (last && last.hit === part.hit) last.text += part.text;
		else merged.push({ ...part });
	}
	return merged;
}

/** Splits text into parts, marking every word that starts with one of the tokens. */
export function markWords(text: string, tokens: string[]): TextPart[] {
	return mergeParts(splitParts(text, tokens));
}

/** markWords, cut to a window around the first hit (ellipsis where text was cut). */
export function snippet(text: string, tokens: string[], radius = 60): TextPart[] {
	const parts = splitParts(text, tokens);
	const first = parts.findIndex((part) => part.hit);

	let start = 0;
	let end = 0;
	if (first < 0) {
		for (let length = 0; end < parts.length && length < radius * 2; end++) {
			length += parts[end].text.length;
		}
	} else {
		start = first;
		for (let length = 0; start > 0 && length < radius; start--)
			length += parts[start - 1].text.length;
		end = first + 1;
		for (let length = 0; end < parts.length && length < radius; end++)
			length += parts[end].text.length;
	}

	const window = mergeParts(parts.slice(start, end));
	const head = window[0];
	if (head && !head.hit) head.text = head.text.trimStart();
	const tail = window.at(-1);
	if (tail && !tail.hit) tail.text = tail.text.trimEnd();

	const cut = window.filter((part) => part.text !== '');
	if (start > 0) cut.unshift({ text: '…', hit: false });
	if (end < parts.length) cut.push({ text: '…', hit: false });
	return mergeParts(cut);
}

/** What search matches a message on: its text and its attachment file names. */
export function searchableText(message: StoredMessage): string {
	const names = (message.attachments ?? []).map((attachment) => attachment.filename);
	return [messagePlainText(message.content), ...names].filter(Boolean).join(' ');
}
