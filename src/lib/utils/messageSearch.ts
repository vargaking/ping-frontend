import type { StoredMessage, StoredPost } from '$lib/types/localHistory.types';
import { db } from '$lib/utils/db';
import { messagePlainText } from '$lib/utils/messageContent';
import { normalizeText, tokenize } from '$lib/utils/searchText';
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

export function queryTokens(query: string): string[] {
	return tokenize(query);
}

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

type TimeIndex = '[server_id+ts]' | '[channel_id+ts]' | '[post_id+ts]' | '[conversation_id+ts]';

/** Primary keys of the scope's messages, newest first, read from the time index. */
function scopeKeysNewestFirst(scope: SearchScope): Promise<string[]> {
	if (scope.kind === 'everywhere') {
		return db.messages.orderBy('ts').reverse().primaryKeys();
	}
	const [index, id]: [TimeIndex, number] =
		scope.kind === 'server'
			? ['[server_id+ts]', scope.serverId]
			: scope.kind === 'channel'
				? ['[channel_id+ts]', scope.channelId]
				: scope.kind === 'post'
					? ['[post_id+ts]', scope.postId]
					: ['[conversation_id+ts]', scope.conversationId];
	return db.messages
		.where(index)
		.between([id, Dexie.minKey], [id, Dexie.maxKey])
		.reverse()
		.primaryKeys();
}

/** Ids of every stored message matching all tokens within scope, newest first. */
export async function findMessageIds(tokens: string[], scope: SearchScope): Promise<string[]> {
	if (tokens.length === 0) return [];
	const matches = await intersectPrefixes('messages', tokens);
	if (matches.size === 0) return [];

	if (matches.size > SMALL_MATCH_SET) {
		const ordered = await scopeKeysNewestFirst(scope);
		return ordered.filter((id) => matches.has(id));
	}

	const rows = await db.messages.bulkGet([...matches] as string[]);
	return rows
		.filter((row): row is StoredMessage => row != null && inMessageScope(row, scope))
		.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || (a.id < b.id ? 1 : -1))
		.map((row) => row.id);
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

/** Forum posts whose title matches all tokens, most recently active first. */
export async function findPosts(
	tokens: string[],
	scope: SearchScope,
	limit = 5
): Promise<StoredPost[]> {
	if (tokens.length === 0 || scope.kind === 'direct') return [];
	const matches = await intersectPrefixes('posts', tokens);
	if (matches.size === 0) return [];
	const rows = await db.posts.bulkGet([...matches] as number[]);
	return rows
		.filter((row): row is StoredPost => row != null && inPostScope(row, scope))
		.sort((a, b) => Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at))
		.slice(0, limit);
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
