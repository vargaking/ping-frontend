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

/** One slice of an index in time order: all rows under `key` of a `[x+ts]` index, or the whole `ts` index. */
type Range = { index: TimeIndex; key: string | number } | { index: 'ts' };

type Cursor = { ts: number; id: string };

/** The range within the date window; with `after`, up to and including that time. */
function rangeCollection(range: Range, f: MessageFilters, after: Cursor | null) {
	const lower = f.since ?? Dexie.minKey;
	const upper = after ? after.ts : (f.until ?? Dexie.maxKey);
	const inclusive = after !== null;
	if (range.index === 'ts') return db.messages.where('ts').between(lower, upper, true, inclusive);
	return db.messages
		.where(range.index)
		.between([range.key, lower], [range.key, upper], true, inclusive);
}

function scopeRange(scope: SearchScope): Range {
	switch (scope.kind) {
		case 'everywhere':
			return { index: 'ts' };
		case 'server':
			return { index: '[server_id+ts]', key: scope.serverId };
		case 'channel':
			return { index: '[channel_id+ts]', key: scope.channelId };
		case 'post':
			return { index: '[post_id+ts]', key: scope.postId };
		case 'direct':
			return { index: '[conversation_id+ts]', key: scope.conversationId };
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

function newestFirst(a: StoredMessage, b: StoredMessage): number {
	return (b.ts ?? 0) - (a.ts ?? 0) || (a.id < b.id ? 1 : -1);
}

async function rowsNewestFirst(
	ids: Iterable<string>,
	scope: SearchScope,
	f: MessageFilters,
	words: Set<string> | null
): Promise<StoredMessage[]> {
	const rows = await db.messages.bulkGet([...ids]);
	return rows
		.filter((row): row is StoredMessage => row != null && matchesRow(row, scope, f, words))
		.sort(newestFirst);
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

/** Ids of every stored message matching all tokens within scope, newest first. */
export async function findMessageIds(tokens: string[], scope: SearchScope): Promise<string[]> {
	if (tokens.length === 0) return [];
	const words = (await intersectPrefixes('messages', tokens)) as Set<string>;
	if (words.size === 0) return [];
	if (words.size <= SMALL_MATCH_SET) {
		const rows = await rowsNewestFirst(words, scope, NO_FILTERS, words);
		return rows.map((row) => row.id);
	}
	const inScope = await rangeCollection(scopeRange(scope), NO_FILTERS, null).primaryKeys();
	return inScope.reverse().filter((id) => words.has(id));
}

export type MessagePager = {
	/** Up to n more matching rows, newest first; [] when done. */
	next(n: number): Promise<StoredMessage[]>;
};

/** Loads up to `count` more matching rows from one source, newest first. */
type Load = (count: number) => Promise<StoredMessage[]>;

/** Walks one range with a reverse cursor, resuming strictly older than the last row it gave. */
function walkRange(
	range: Range,
	filters: MessageFilters,
	matches: (row: StoredMessage) => boolean
): Load {
	let after: Cursor | null = null;
	return async (count) => {
		const from = after;
		const rows = await rangeCollection(range, filters, from)
			.reverse()
			.filter((row) => {
				// Rows sharing the cursor's time come back id descending, so skip the ones already given.
				const seen = from && row.ts === from.ts && row.id >= from.id;
				return !seen && matches(row);
			})
			.limit(count)
			.toArray();
		const last = rows.at(-1);
		if (last) after = { ts: last.ts ?? 0, id: last.id };
		return rows;
	};
}

function serveRows(rows: StoredMessage[]): Load {
	let served = 0;
	return async (count) => rows.slice(served, (served += count));
}

/** Merges sources that are each newest first into one stream of the same order. */
function mergeSources(loads: Load[]): MessagePager {
	const buffers: StoredMessage[][] = loads.map(() => []);
	const done = loads.map(() => false);
	return {
		async next(n) {
			const out: StoredMessage[] = [];
			while (out.length < n) {
				await Promise.all(
					loads.map(async (load, i) => {
						if (buffers[i].length > 0 || done[i]) return;
						buffers[i] = await load(n);
						done[i] = buffers[i].length < n;
					})
				);
				let best = -1;
				for (let i = 0; i < buffers.length; i++) {
					if (buffers[i].length === 0) continue;
					if (best < 0 || newestFirst(buffers[i][0], buffers[best][0]) < 0) best = i;
				}
				if (best < 0) break;
				out.push(buffers[best].shift()!);
			}
			return out;
		}
	};
}

const EMPTY_PAGER: MessagePager = { next: async () => [] };

/** Ranges that each hold every match, so any one of them can drive the search. The ranges of
 *  several `from:` keys form one candidate, merged. */
function driverCandidates(scope: SearchScope, f: MessageFilters): Range[][] {
	const candidates: Range[][] = f.has.map((kind) => [
		{ index: `[${HAS_FIELD[kind]}+ts]` as TimeIndex, key: 1 }
	]);
	if (f.fromKeys) {
		candidates.push(f.fromKeys.map((key) => ({ index: '[fromKey+ts]', key })));
	}
	if (scope.kind !== 'everywhere' || candidates.length === 0) candidates.push([scopeRange(scope)]);
	return candidates;
}

/** Messages matching all tokens and filters within scope, newest first, read as they are asked
 *  for. Walks the smallest index range that must contain every match and checks the rest per
 *  row, so a query with a big range doesn't read all of it up front. */
export async function pageMessages(
	tokens: string[],
	scope: SearchScope,
	filters: MessageFilters
): Promise<MessagePager> {
	if (tokens.length === 0 && !isFiltered(filters)) return EMPTY_PAGER;
	if (filters.fromKeys?.length === 0) return EMPTY_PAGER;
	if (filters.since !== null && filters.until !== null && filters.since >= filters.until) {
		return EMPTY_PAGER;
	}

	let words: Set<string> | null = null;
	if (tokens.length > 0) {
		words = (await intersectPrefixes('messages', tokens)) as Set<string>;
		if (words.size === 0) return EMPTY_PAGER;
	}

	const candidates = await Promise.all(
		driverCandidates(scope, filters).map(async (ranges) => {
			const counts = await Promise.all(
				ranges.map((range) => rangeCollection(range, filters, null).count())
			);
			return {
				ranges: ranges.filter((_, i) => counts[i] > 0),
				size: counts.reduce((sum, count) => sum + count, 0)
			};
		})
	);
	const driver = candidates.reduce((a, b) => (b.size < a.size ? b : a));
	if (driver.size === 0) return EMPTY_PAGER;

	if (words && words.size <= SMALL_MATCH_SET && words.size < driver.size) {
		return mergeSources([serveRows(await rowsNewestFirst(words, scope, filters, words))]);
	}
	const matches = (row: StoredMessage) => matchesRow(row, scope, filters, words);
	return mergeSources(driver.ranges.map((range) => walkRange(range, filters, matches)));
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
