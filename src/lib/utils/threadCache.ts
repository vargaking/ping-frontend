import Dexie from 'dexie';
import type { MessageType } from '$lib/types/messages.types';
import type { StoredMessage } from '$lib/types/localHistory.types';
import { db, localHistoryReady } from '$lib/utils/db';
import { timestampMs } from '$lib/utils/messageContent';
import { HAS_FIELDS } from '$lib/utils/searchFacets';

export const CACHED_TAIL_SIZE = 50;

export type CachedThread =
	| { kind: 'channel'; channelId: number }
	| { kind: 'post'; postId: number }
	| { kind: 'direct'; conversationId: number };

function indexOf(thread: CachedThread): { index: string; key: number } {
	switch (thread.kind) {
		case 'channel':
			return { index: '[channel_id+ts]', key: thread.channelId };
		case 'post':
			return { index: '[post_id+ts]', key: thread.postId };
		case 'direct':
			return { index: '[conversation_id+ts]', key: thread.conversationId };
	}
}

/** A forum post's messages carry the channel's id too; the channel's own list leaves them out. */
function inThread(thread: CachedThread, message: StoredMessage): boolean {
	return thread.kind !== 'channel' || message.post_id == null;
}

function toMessage(stored: StoredMessage): MessageType {
	const message = { ...stored };
	delete message.ts;
	delete message.words;
	delete message.fromKey;
	for (const field of HAS_FIELDS) delete message[field];
	return message;
}

/** The newest cached messages of a thread, oldest first; null when there is no usable local history. */
export async function readNewest(
	thread: CachedThread,
	limit = CACHED_TAIL_SIZE
): Promise<MessageType[] | null> {
	try {
		if (!(await localHistoryReady())) return null;
		const { index, key } = indexOf(thread);
		const rows = await db.messages
			.where(index)
			.between([key, Dexie.minKey], [key, Dexie.maxKey])
			.reverse()
			.filter((m) => inThread(thread, m))
			.limit(limit)
			.toArray();
		return rows.reverse().map(toMessage);
	} catch (e) {
		console.warn('Failed to read messages from the local cache', e);
		return null;
	}
}

export type PageRange = {
	/** The newest page, oldest first. */
	page: MessageType[];
	/** The page is the whole thread: nothing older exists. */
	complete: boolean;
	/** Ids on screen when the page was requested. */
	requested: ReadonlySet<string>;
	/** Ids on screen now (the page, live arrivals, unsent messages); read inside the transaction. */
	keep: () => ReadonlySet<string>;
};

/** Deletes the thread's cached messages that the newest page proves gone; returns their ids. */
export async function pruneToPage(thread: CachedThread, range: PageRange): Promise<string[]> {
	const { page, complete, requested, keep } = range;
	if (page.length === 0 || !(await localHistoryReady())) return [];

	const { index, key } = indexOf(thread);
	const lower = timestampMs(page[0].timestamp);
	const upper = timestampMs(page[page.length - 1].timestamp);
	const inPage = new Set(page.map((m) => m.id));

	return db.transaction('rw', db.messages, async () => {
		const candidates = await db.messages
			.where(index)
			.between([key, complete ? Dexie.minKey : lower], [key, Dexie.maxKey], complete, true)
			.filter((m) => inThread(thread, m))
			.toArray();
		const onScreen = keep();
		const gone = candidates
			.filter(
				(m) =>
					!inPage.has(m.id) &&
					m.status == null &&
					!onScreen.has(m.id) &&
					// The page is ordered by server time and ts is the sender's clock, so a partial page
					// only proves gone what was on screen when it was requested.
					(complete ? (m.ts != null && m.ts <= upper) || requested.has(m.id) : requested.has(m.id))
			)
			.map((m) => m.id);
		await db.messages.bulkDelete(gone);
		return gone;
	});
}
