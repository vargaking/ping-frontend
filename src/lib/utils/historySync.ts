import type { MessagePage } from '$lib/requests/channels/getChannelMessages';
import { normalizeError } from '$lib/requests/errors';
import type { Channel } from '$lib/types/channel.types';
import type { Conversation } from '$lib/types/conversation.types';
import type { ForumPostPage } from '$lib/types/forum.types';
import type { ThreadSync } from '$lib/types/localHistory.types';
import type { MessageType } from '$lib/types/messages.types';
import { db } from '$lib/utils/db';
import { tokenize } from '$lib/utils/searchText';
import { channelThreadKey, directThreadKey, postThreadKey } from '$lib/utils/threadKeys';

export type SyncThread =
	| { kind: 'channel'; key: string; serverId: number; channelId: number; marker: string | null }
	| {
			kind: 'post';
			key: string;
			serverId: number;
			channelId: number;
			postId: number;
			marker: string;
	  }
	| { kind: 'direct'; key: string; conversationId: number; marker: string | null };

export type HistoryApi = {
	channels(serverId: number, signal: AbortSignal): Promise<Channel[]>;
	posts(channelId: number, cursor: string | null, signal: AbortSignal): Promise<ForumPostPage>;
	conversations(signal: AbortSignal): Promise<Conversation[]>;
	page(thread: SyncThread, before: string | null, signal: AbortSignal): Promise<MessagePage>;
};

export type HistoryProgress = { threads: number; complete: number };

export type HistorySyncOptions = {
	api: HistoryApi;
	serverIds: number[];
	/** Tried first. */
	preferServerId: number | null;
	signal: AbortSignal;
	/** False when the browser asks to save data: catch up only, no walk to the oldest message. */
	fullHistory: boolean;
	/** Pause between requests. */
	gapMs?: number;
	onProgress?: (progress: HistoryProgress) => void;
};

const HEAD_SIZE = 10;

class Aborted extends Error {}

type Listing = { serverId: number; threads: SyncThread[] };

function isGone(error: unknown): boolean {
	const status = normalizeError(error).status;
	return status === 403 || status === 404;
}

function newSync(thread: SyncThread, page: MessagePage, marker: string): ThreadSync {
	return {
		key: thread.key,
		serverId: thread.kind === 'direct' ? null : thread.serverId,
		channelId: thread.kind === 'direct' ? null : thread.channelId,
		head: page.messages.slice(0, HEAD_SIZE).map((m) => m.id),
		marker,
		olderCursor: page.next_cursor,
		complete: isLastPage(page)
	};
}

/** A page that claims more history but gives no cursor to reach it can't be continued. */
function isLastPage(page: MessagePage): boolean {
	return !page.has_more || page.next_cursor == null;
}

async function storePage(messages: MessageType[], sync: ThreadSync | null): Promise<void> {
	await db.transaction('rw', db.messages, db.threadSync, async () => {
		await db.messages.bulkPut(messages);
		if (sync) await db.threadSync.put(sync);
	});
}

async function dropThread(thread: SyncThread): Promise<void> {
	await db.transaction('rw', db.messages, db.threadSync, async () => {
		if (thread.kind === 'channel')
			await db.messages.where('channel_id').equals(thread.channelId).delete();
		else if (thread.kind === 'post')
			await db.messages.where('post_id').equals(thread.postId).delete();
		else await db.messages.where('conversation_id').equals(thread.conversationId).delete();
		await db.threadSync.delete(thread.key);
	});
}

async function purgeChannel(channelId: number): Promise<void> {
	await db.transaction('rw', db.messages, db.posts, db.threadSync, async () => {
		const postIds = await db.posts.where('channel_id').equals(channelId).primaryKeys();
		await db.messages.where('post_id').anyOf(postIds).delete();
		await db.messages.where('channel_id').equals(channelId).delete();
		await db.posts.where('channel_id').equals(channelId).delete();
		await db.threadSync.where('channelId').equals(channelId).delete();
	});
}

async function purgeServer(serverId: number): Promise<void> {
	await db.transaction('rw', db.messages, db.posts, db.threadSync, async () => {
		const postIds = await db.posts.where('server_id').equals(serverId).primaryKeys();
		await db.messages.where('post_id').anyOf(postIds).delete();
		await db.messages.where('server_id').equals(serverId).delete();
		await db.posts.where('server_id').equals(serverId).delete();
		await db.threadSync.where('serverId').equals(serverId).delete();
	});
}

/** Channel ids this device holds something for, within one server. */
async function localChannelIds(serverId: number): Promise<Set<number>> {
	const ids = new Set<number>();
	for (const row of await db.threadSync.where('serverId').equals(serverId).toArray()) {
		if (row.channelId != null) ids.add(row.channelId);
	}
	for (const post of await db.posts.where('server_id').equals(serverId).toArray()) {
		ids.add(post.channel_id);
	}
	// Rows are cached per channel, so one sample says which server a channel's messages are from.
	for (const channelId of (await db.messages.orderBy('channel_id').uniqueKeys()) as number[]) {
		if (ids.has(channelId)) continue;
		const sample = await db.messages.where('channel_id').equals(channelId).first();
		if (sample?.server_id === serverId) ids.add(channelId);
	}
	return ids;
}

async function localServerIds(): Promise<Set<number>> {
	const ids = await Promise.all([
		db.messages.orderBy('server_id').uniqueKeys(),
		db.posts.orderBy('server_id').uniqueKeys(),
		db.threadSync.orderBy('serverId').uniqueKeys()
	]);
	return new Set(ids.flat() as number[]);
}

export async function runHistorySync(options: HistorySyncOptions): Promise<void> {
	const { api, signal, serverIds, preferServerId, fullHistory, onProgress } = options;
	const gapMs = options.gapMs ?? 150;
	let requests = 0;

	const sleep = (ms: number) =>
		new Promise<void>((resolve) => {
			const timer = setTimeout(done, ms);
			function done() {
				clearTimeout(timer);
				signal.removeEventListener('abort', done);
				resolve();
			}
			signal.addEventListener('abort', done, { once: true });
		});

	const checkAborted = () => {
		if (signal.aborted) throw new Aborted();
	};

	async function request<T>(call: () => Promise<T>): Promise<T> {
		checkAborted();
		if (requests++ > 0 && gapMs > 0) await sleep(gapMs);
		checkAborted();
		let result: T;
		try {
			result = await call();
		} catch (e) {
			checkAborted();
			throw e;
		}
		checkAborted();
		return result;
	}

	async function listPostThreads(serverId: number, channelId: number): Promise<SyncThread[]> {
		const posts = new Map<number, ForumPostPage['posts'][number]>();
		let cursor: string | null = null;
		do {
			const page: ForumPostPage = await request(() => api.posts(channelId, cursor, signal));
			for (const post of page.posts) posts.set(post.id, post);
			cursor = page.next_cursor && page.next_cursor !== cursor ? page.next_cursor : null;
		} while (cursor);

		await db.transaction('rw', db.posts, db.messages, db.threadSync, async () => {
			await db.posts.bulkPut(
				[...posts.values()].map((post) => ({
					...post,
					server_id: serverId,
					words: tokenize(post.title)
				}))
			);
			const unlisted = (await db.posts.where('channel_id').equals(channelId).primaryKeys()).filter(
				(id) => !posts.has(id)
			);
			await db.messages.where('post_id').anyOf(unlisted).delete();
			await db.threadSync.bulkDelete(unlisted.map(postThreadKey));
			await db.posts.bulkDelete(unlisted);
		});

		return [...posts.values()].map((post) => ({
			kind: 'post',
			key: postThreadKey(post.id),
			serverId,
			channelId,
			postId: post.id,
			marker: post.last_activity_at
		}));
	}

	/** Null when the server's channels can't be listed this run. */
	async function listServer(serverId: number): Promise<Listing | null> {
		let channels: Channel[];
		try {
			channels = await request(() => api.channels(serverId, signal));
		} catch (e) {
			if (e instanceof Aborted) throw e;
			return null;
		}

		const threads: SyncThread[] = [];
		for (const channel of channels) {
			if (channel.type === 'text') {
				threads.push({
					kind: 'channel',
					key: channelThreadKey(channel.id),
					serverId,
					channelId: channel.id,
					marker: channel.last_message_id ?? null
				});
			} else if (channel.type === 'forum') {
				try {
					threads.push(...(await listPostThreads(serverId, channel.id)));
				} catch (e) {
					if (e instanceof Aborted) throw e;
				}
			}
		}

		const listed = new Set(channels.map((c) => c.id));
		for (const channelId of await localChannelIds(serverId)) {
			if (!listed.has(channelId)) await purgeChannel(channelId);
		}
		return { serverId, threads };
	}

	async function listDirect(): Promise<SyncThread[]> {
		try {
			const conversations = await request(() => api.conversations(signal));
			return conversations.map((c) => ({
				kind: 'direct',
				key: directThreadKey(c.id),
				conversationId: c.id,
				marker: c.last_message_id ?? null
			}));
		} catch (e) {
			if (e instanceof Aborted) throw e;
			return [];
		}
	}

	async function run() {
		const ordered = [
			...serverIds.filter((id) => id === preferServerId),
			...serverIds.filter((id) => id !== preferServerId)
		];

		const direct = await listDirect();
		const serverThreads: SyncThread[] = [];
		for (const serverId of ordered) {
			const listing = await listServer(serverId);
			if (listing) serverThreads.push(...listing.threads);
		}

		const kept = new Set(serverIds);
		for (const serverId of await localServerIds()) {
			if (!kept.has(serverId)) await purgeServer(serverId);
		}
		checkAborted();

		const threads = [...direct, ...serverThreads].filter((t) => t.marker != null);
		const live = new Set(threads.map((t) => t.key));
		const finished = new Set(
			(await db.threadSync.bulkGet([...live])).filter((s) => s?.complete).map((s) => s!.key)
		);
		const report = () => onProgress?.({ threads: live.size, complete: finished.size });
		report();

		const markComplete = (key: string) => {
			if (finished.has(key)) return;
			finished.add(key);
			report();
		};

		const drop = async (thread: SyncThread) => {
			await dropThread(thread);
			live.delete(thread.key);
			finished.delete(thread.key);
			report();
		};

		const fetchPage = (thread: SyncThread, before: string | null) =>
			request(() => api.page(thread, before, signal));

		async function catchUp(thread: SyncThread) {
			const marker = thread.marker!;
			const sync = (await db.threadSync.get(thread.key)) ?? null;
			if (sync?.marker === marker) return;

			let page = await fetchPage(thread, null);
			if (!sync) {
				const next = newSync(thread, page, marker);
				await storePage(page.messages, next);
				if (next.complete) markComplete(thread.key);
				return;
			}

			const known = new Set(sync.head);
			const head = page.messages.slice(0, HEAD_SIZE).map((m) => m.id);
			while (true) {
				const reachedKnown = page.messages.some((m) => known.has(m.id));
				const reachedEnd = isLastPage(page);
				if (reachedKnown || reachedEnd) {
					const next = { ...sync, head, marker, complete: sync.complete || reachedEnd };
					await storePage(page.messages, next);
					if (next.complete) markComplete(thread.key);
					return;
				}
				await storePage(page.messages, null);
				page = await fetchPage(thread, page.next_cursor);
			}
		}

		async function walkOlder(thread: SyncThread) {
			let sync = (await db.threadSync.get(thread.key)) ?? null;
			while (sync && !sync.complete) {
				const page = await fetchPage(thread, sync.olderCursor);
				const next: ThreadSync = {
					...sync,
					olderCursor: page.next_cursor,
					complete: isLastPage(page)
				};
				await storePage(page.messages, next);
				sync = next;
			}
			if (sync?.complete) markComplete(thread.key);
		}

		for (const thread of threads) {
			try {
				await catchUp(thread);
			} catch (e) {
				if (!isGone(e)) throw e;
				await drop(thread);
			}
		}

		if (!fullHistory) return;
		for (const thread of threads) {
			if (!live.has(thread.key) || finished.has(thread.key)) continue;
			try {
				await walkOlder(thread);
			} catch (e) {
				if (!isGone(e)) throw e;
				await drop(thread);
			}
		}
	}

	try {
		await run();
	} catch (e) {
		if (!(e instanceof Aborted)) throw e;
	}
}
