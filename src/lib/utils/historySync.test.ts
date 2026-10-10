import 'fake-indexeddb/auto';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MessagePage } from '$lib/requests/channels/getChannelMessages';
import type { Channel } from '$lib/types/channel.types';
import type { Conversation } from '$lib/types/conversation.types';
import type { ForumPost, ForumPostPage } from '$lib/types/forum.types';
import type { MessageType } from '$lib/types/messages.types';
import { clearLocalCache, db } from './db';
import {
	runHistorySync,
	type HistoryApi,
	type HistoryProgress,
	type HistorySyncOptions,
	type SyncThread
} from './historySync';
import { channelThreadKey, directThreadKey, postThreadKey } from './threadKeys';

const httpError = (status: number) =>
	new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
		status,
		statusText: '',
		data: {},
		headers: {},
		config: {} as never
	});
const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');

type Scope =
	| { kind: 'channel'; serverId: number; channelId: number }
	| { kind: 'post'; serverId: number; channelId: number; postId: number }
	| { kind: 'direct'; conversationId: number };

type FakeThread = {
	thread: Scope;
	messages: MessageType[];
};

/** A scripted server: threads hold their messages newest first and are paged by offset. */
class FakeApi implements HistoryApi {
	pageSize = 3;
	postPageSize = 2;
	channelsByServer = new Map<number, Channel[]>();
	postsByChannel = new Map<number, ForumPost[]>();
	conversationIds: number[] = [];
	threads = new Map<string, FakeThread>();
	listingErrors = new Map<number, unknown>();
	pageErrors = new Map<string, unknown>();
	pageCalls: { key: string; before: string | null }[] = [];
	onPage: (() => void) | null = null;
	private counter = 0;

	addChannel(serverId: number, channelId: number, count: number, type: Channel['type'] = 'text') {
		const channel: Channel = {
			id: channelId,
			name: `c${channelId}`,
			channel_settings: {},
			type,
			group_id: null,
			position: 0
		};
		this.channelsByServer.set(serverId, [...(this.channelsByServer.get(serverId) ?? []), channel]);
		if (type === 'text')
			this.addThread(channelThreadKey(channelId), { kind: 'channel', serverId, channelId }, count);
	}

	addPost(serverId: number, channelId: number, postId: number, title: string, count: number) {
		const post = {
			id: postId,
			channel_id: channelId,
			title,
			author_id: 1,
			tag_ids: [],
			pinned: false,
			locked: false,
			reply_count: count,
			created_at: '2025-01-01T00:00:00Z',
			last_activity_at: '',
			thumbnail: null
		} satisfies ForumPost;
		this.postsByChannel.set(channelId, [...(this.postsByChannel.get(channelId) ?? []), post]);
		this.addThread(postThreadKey(postId), { kind: 'post', serverId, channelId, postId }, count);
	}

	addConversation(conversationId: number, count: number) {
		this.conversationIds.push(conversationId);
		this.addThread(directThreadKey(conversationId), { kind: 'direct', conversationId }, count);
	}

	private addThread(key: string, thread: Scope, count: number) {
		this.threads.set(key, { thread, messages: [] });
		this.push(key, count);
	}

	/** New messages arrive at the top of the thread. */
	push(key: string, count: number) {
		const entry = this.threads.get(key)!;
		const t = entry.thread;
		for (let i = 0; i < count; i++) {
			const n = ++this.counter;
			entry.messages.unshift({
				id: `m${n}`,
				user_id: 1,
				content: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: `message number${n}` }] }]
				},
				timestamp: new Date(Date.UTC(2025, 0, 1, 0, 0, n)).toISOString(),
				server_id: 'serverId' in t ? t.serverId : null,
				channel_id: 'channelId' in t ? t.channelId : null,
				conversation_id: t.kind === 'direct' ? t.conversationId : null,
				post_id: t.kind === 'post' ? t.postId : null
			});
		}
	}

	/** The server deletes these messages. */
	remove(key: string, ids: string[]) {
		const entry = this.threads.get(key)!;
		entry.messages = entry.messages.filter((m) => !ids.includes(m.id));
	}

	ids(key: string): string[] {
		return this.threads.get(key)!.messages.map((m) => m.id);
	}

	private newestId(key: string): string | null {
		return this.threads.get(key)?.messages[0]?.id ?? null;
	}

	async channels(serverId: number): Promise<Channel[]> {
		if (this.listingErrors.has(serverId)) throw this.listingErrors.get(serverId);
		return (this.channelsByServer.get(serverId) ?? []).map((c) => ({
			...c,
			last_message_id: c.type === 'text' ? this.newestId(channelThreadKey(c.id)) : null
		}));
	}

	async posts(channelId: number, cursor: string | null): Promise<ForumPostPage> {
		const all = (this.postsByChannel.get(channelId) ?? []).map((p) => ({
			...p,
			last_activity_at: this.newestId(postThreadKey(p.id)) ?? p.created_at
		}));
		const offset = cursor ? Number(cursor) : 0;
		const end = offset + this.postPageSize;
		return { posts: all.slice(offset, end), next_cursor: end < all.length ? String(end) : null };
	}

	async conversations(): Promise<Conversation[]> {
		return this.conversationIds.map(
			(id) => ({ id, last_message_id: this.newestId(directThreadKey(id)) }) as Conversation
		);
	}

	async page(thread: SyncThread, before: string | null): Promise<MessagePage> {
		this.pageCalls.push({ key: thread.key, before });
		this.onPage?.();
		if (this.pageErrors.has(thread.key)) throw this.pageErrors.get(thread.key);
		const all = this.threads.get(thread.key)!.messages;
		const offset = before ? Number(before) : 0;
		const end = offset + this.pageSize;
		return {
			messages: all.slice(offset, end),
			has_more: end < all.length,
			next_cursor: end < all.length ? String(end) : null
		};
	}

	pagesFor(key: string): (string | null)[] {
		return this.pageCalls.filter((c) => c.key === key).map((c) => c.before);
	}
}

let fake: FakeApi;

function sync(options: Partial<HistorySyncOptions> = {}) {
	return runHistorySync({
		api: fake,
		serverIds: [1],
		preferServerId: null,
		signal: new AbortController().signal,
		fullHistory: true,
		gapMs: 0,
		...options
	});
}

const storedIds = async (key: string) => {
	const rows = key.startsWith('dm:')
		? await db.messages
				.where('conversation_id')
				.equals(Number(key.slice(3)))
				.toArray()
		: key.startsWith('post:')
			? await db.messages
					.where('post_id')
					.equals(Number(key.slice(5)))
					.toArray()
			: await db.messages.where('channel_id').equals(Number(key)).toArray();
	return rows.map((m) => m.id).sort();
};

beforeEach(async () => {
	await clearLocalCache();
	fake = new FakeApi();
});

describe('first download', () => {
	it('fetches every page of a channel and marks it complete', async () => {
		fake.addChannel(1, 10, 8);

		await sync();

		expect(await storedIds('10')).toEqual(fake.ids('10').sort());
		expect(fake.pagesFor('10')).toEqual([null, '3', '6']);
		const row = await db.threadSync.get('10');
		expect(row).toMatchObject({
			complete: true,
			serverId: 1,
			channelId: 10,
			marker: fake.ids('10')[0]
		});
		expect(row?.head).toEqual(fake.ids('10').slice(0, 3));
	});

	it('keeps only ten ids as the head', async () => {
		fake.pageSize = 100;
		fake.addChannel(1, 10, 25);

		await sync();

		expect((await db.threadSync.get('10'))?.head).toEqual(fake.ids('10').slice(0, 10));
	});

	it('derives search words for what it stores', async () => {
		fake.addChannel(1, 10, 2);

		await sync();

		const row = await db.messages.get(fake.ids('10')[0]);
		expect(row?.words).toEqual(['message', `number${row?.id.slice(1)}`]);
	});

	it('downloads direct messages', async () => {
		fake.addConversation(5, 7);

		await sync({ serverIds: [] });

		expect(await storedIds('dm:5')).toEqual(fake.ids('dm:5').sort());
		expect((await db.threadSync.get('dm:5'))?.complete).toBe(true);
	});

	it('does not request an empty thread', async () => {
		fake.addChannel(1, 10, 0);
		fake.addConversation(5, 0);

		await sync();

		expect(fake.pageCalls).toEqual([]);
		expect(await db.threadSync.count()).toBe(0);
	});

	it('works through direct messages first, then the preferred server', async () => {
		fake.pageSize = 100;
		fake.addChannel(1, 10, 1);
		fake.addChannel(2, 20, 1);
		fake.addChannel(3, 30, 1);
		fake.addConversation(5, 1);

		await sync({ serverIds: [1, 2, 3], preferServerId: 3 });

		expect(fake.pageCalls.map((c) => c.key)).toEqual(['dm:5', '30', '10', '20']);
	});

	it('ignores voice channels', async () => {
		fake.addChannel(1, 10, 1, 'voice');

		await sync();

		expect(fake.pageCalls).toEqual([]);
	});
});

describe('stopping and resuming', () => {
	it('resumes from the saved cursor without refetching finished pages', async () => {
		fake.addChannel(1, 10, 10);
		const controller = new AbortController();
		fake.onPage = () => {
			if (fake.pageCalls.length === 3) controller.abort();
		};

		await sync({ signal: controller.signal });

		expect(fake.pagesFor('10')).toEqual([null, '3', '6']);
		expect((await db.threadSync.get('10'))?.olderCursor).toBe('6');
		expect(await storedIds('10')).toHaveLength(6);

		fake.pageCalls = [];
		fake.onPage = null;
		await sync();

		expect(fake.pagesFor('10')).toEqual(['6', '9']);
		expect(await storedIds('10')).toEqual(fake.ids('10').sort());
		expect((await db.threadSync.get('10'))?.complete).toBe(true);
	});

	it('writes nothing for a request that finishes after the abort', async () => {
		fake.addChannel(1, 10, 10);
		const controller = new AbortController();
		fake.onPage = () => controller.abort();

		await sync({ signal: controller.signal });

		expect(await db.messages.count()).toBe(0);
		expect(await db.threadSync.count()).toBe(0);
	});

	it('stops waiting between requests when aborted', async () => {
		fake.addChannel(1, 10, 10);
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 20);

		await sync({ signal: controller.signal, gapMs: 60_000 });

		expect(fake.pageCalls).toEqual([]);
	});

	it('resolves quietly when the api throws because of the abort', async () => {
		fake.addChannel(1, 10, 10);
		const controller = new AbortController();
		fake.pageErrors.set('10', networkError());
		fake.onPage = () => controller.abort();

		await expect(sync({ signal: controller.signal })).resolves.toBeUndefined();
	});
});

describe('catching up', () => {
	beforeEach(async () => {
		fake.addChannel(1, 10, 8);
		await sync();
		fake.pageCalls = [];
	});

	it('makes no page request when the marker is unchanged', async () => {
		await sync();

		expect(fake.pageCalls).toEqual([]);
	});

	it('stops at the page that contains a known id', async () => {
		fake.push('10', 5);

		await sync();

		expect(fake.pagesFor('10')).toEqual([null, '3']);
		expect(await storedIds('10')).toEqual(fake.ids('10').sort());
		const row = await db.threadSync.get('10');
		expect(row?.marker).toBe(fake.ids('10')[0]);
		expect(row?.head).toEqual(fake.ids('10').slice(0, 3));
		expect(row?.complete).toBe(true);
	});

	it('needs a single request for one new message', async () => {
		fake.push('10', 1);

		await sync();

		expect(fake.pagesFor('10')).toEqual([null]);
		expect(await storedIds('10')).toEqual(fake.ids('10').sort());
	});

	it('leaves the older cursor alone while the history is incomplete', async () => {
		await clearLocalCache();
		await sync({ fullHistory: false });
		const before = await db.threadSync.get('10');
		expect(before?.complete).toBe(false);

		fake.push('10', 1);
		fake.pageCalls = [];
		await sync({ fullHistory: false });

		const after = await db.threadSync.get('10');
		expect(after?.olderCursor).toBe(before?.olderCursor);
		expect(after?.complete).toBe(false);
		expect(after?.marker).toBe(fake.ids('10')[0]);
	});

	it('walks to the end when every known id is gone, and completes', async () => {
		await clearLocalCache();
		await sync({ fullHistory: false });
		const known = (await db.threadSync.get('10'))!.head;
		fake.remove('10', known);
		fake.push('10', 1);
		fake.pageCalls = [];

		await sync({ fullHistory: false });

		expect(fake.pagesFor('10')).toEqual([null, '3']);
		const row = await db.threadSync.get('10');
		expect(row?.complete).toBe(true);
		expect(row?.marker).toBe(fake.ids('10')[0]);
		expect(row?.head).toEqual(fake.ids('10').slice(0, 3));
	});

	it('does not store a cursor ahead of the stored messages', async () => {
		await clearLocalCache();
		const controller = new AbortController();
		fake.onPage = () => {
			if (fake.pageCalls.length === 3) controller.abort();
		};
		await sync({ signal: controller.signal });

		const row = await db.threadSync.get('10');
		const stored = await storedIds('10');
		expect(stored.length).toBe(6);
		expect(row?.olderCursor).toBe(String(stored.length));
	});
});

describe('no longer readable', () => {
	it('deletes a channel that left the listing, with its sync row', async () => {
		fake.addChannel(1, 10, 4);
		fake.addChannel(1, 11, 4);
		await sync();

		fake.channelsByServer.set(
			1,
			fake.channelsByServer.get(1)!.filter((c) => c.id !== 10)
		);
		await sync();

		expect(await storedIds('10')).toEqual([]);
		expect(await db.threadSync.get('10')).toBeUndefined();
		expect(await storedIds('11')).toHaveLength(4);
		expect(await db.threadSync.get('11')).toBeDefined();
	});

	it('deletes messages cached by the app for a channel it never synced', async () => {
		fake.addChannel(1, 10, 2);
		await db.messages.put({ ...fake.threads.get('10')!.messages[0], id: 'cached', channel_id: 99 });

		await sync();

		expect(await db.messages.get('cached')).toBeUndefined();
		expect(await db.messages.count()).toBe(2);
	});

	it('purges a server that is no longer in serverIds', async () => {
		fake.addChannel(1, 10, 4);
		fake.addChannel(2, 20, 4);
		fake.addChannel(2, 21, 0, 'forum');
		fake.addPost(2, 21, 100, 'Left behind', 3);
		await sync({ serverIds: [1, 2] });
		expect(await db.posts.count()).toBe(1);

		await sync({ serverIds: [1] });

		expect(await storedIds('20')).toEqual([]);
		expect(await storedIds('post:100')).toEqual([]);
		expect(await db.posts.count()).toBe(0);
		expect(await db.threadSync.where('serverId').equals(2).count()).toBe(0);
		expect(await storedIds('10')).toHaveLength(4);
	});

	it('never purges direct messages', async () => {
		fake.addConversation(5, 4);
		fake.addChannel(1, 10, 2);
		await sync();

		fake.conversationIds = [];
		await sync({ serverIds: [] });

		expect(await storedIds('dm:5')).toHaveLength(4);
		expect(await db.threadSync.get('dm:5')).toBeDefined();
	});

	it.each([
		['a network error', networkError()],
		['a server error', httpError(503)],
		['a 403', httpError(403)],
		['a 404', httpError(404)]
	])('keeps everything of a server whose listing fails with %s', async (_, error) => {
		fake.addChannel(1, 10, 4);
		fake.addChannel(2, 20, 4);
		await sync({ serverIds: [1, 2] });

		fake.listingErrors.set(2, error);
		fake.channelsByServer.set(2, []);
		await expect(sync({ serverIds: [1, 2] })).resolves.toBeUndefined();

		expect(await storedIds('20')).toHaveLength(4);
		expect(await db.threadSync.get('20')).toBeDefined();
	});

	it('still syncs the other servers when one listing fails', async () => {
		fake.addChannel(1, 10, 4);
		fake.addChannel(2, 20, 4);
		fake.listingErrors.set(2, networkError());

		await sync({ serverIds: [1, 2] });

		expect(await storedIds('10')).toHaveLength(4);
		expect(await storedIds('20')).toEqual([]);
	});

	it('drops only the thread that answers 403', async () => {
		fake.addChannel(1, 10, 4);
		fake.addChannel(1, 11, 4);
		fake.addChannel(1, 12, 4);
		await sync();
		fake.push('10', 1);
		fake.push('11', 1);
		fake.push('12', 1);
		fake.pageErrors.set('11', httpError(403));

		await sync();

		expect(await storedIds('11')).toEqual([]);
		expect(await db.threadSync.get('11')).toBeUndefined();
		expect(await storedIds('10')).toEqual(fake.ids('10').sort());
		expect(await storedIds('12')).toEqual(fake.ids('12').sort());
	});

	it('drops a thread that answers 404 on its first download', async () => {
		fake.addChannel(1, 10, 4);
		fake.addConversation(5, 4);
		fake.pageErrors.set('dm:5', httpError(404));

		await sync();

		expect(await db.threadSync.get('dm:5')).toBeUndefined();
		expect(await storedIds('10')).toHaveLength(4);
	});
});

describe('errors', () => {
	it('rejects on a network error and deletes nothing', async () => {
		fake.addChannel(1, 10, 4);
		fake.addChannel(1, 11, 4);
		await sync();
		fake.push('10', 1);
		fake.push('11', 1);
		fake.pageErrors.set('11', networkError());

		await expect(sync()).rejects.toBeInstanceOf(AxiosError);

		expect(await storedIds('10')).toEqual(fake.ids('10').sort());
		expect(await storedIds('11')).toHaveLength(4);
		expect(await db.threadSync.get('11')).toBeDefined();
	});

	it('rejects on a server error', async () => {
		fake.addChannel(1, 10, 4);
		fake.pageErrors.set('10', httpError(500));

		await expect(sync()).rejects.toBeInstanceOf(AxiosError);

		expect(await db.threadSync.count()).toBe(0);
	});
});

describe('forum posts', () => {
	beforeEach(() => {
		fake.addChannel(1, 20, 0, 'forum');
		fake.addPost(1, 20, 100, 'Árvíztűrő tükörfúrógép', 4);
		fake.addPost(1, 20, 101, 'Second post', 2);
		fake.addPost(1, 20, 102, 'Third one', 3);
	});

	it('stores every page of posts with search words and downloads their messages', async () => {
		await sync();

		const posts = await db.posts.orderBy('id').toArray();
		expect(posts.map((p) => p.id)).toEqual([100, 101, 102]);
		expect(posts[0]).toMatchObject({
			server_id: 1,
			channel_id: 20,
			words: ['arvizturo', 'tukorfurogep']
		});
		expect(await storedIds('post:100')).toEqual(fake.ids('post:100').sort());
		expect(await storedIds('post:102')).toEqual(fake.ids('post:102').sort());
		expect(await db.threadSync.get('post:101')).toMatchObject({ channelId: 20, complete: true });
		expect((await db.posts.where('words').startsWith('arv').toArray()).map((p) => p.id)).toEqual([
			100
		]);
	});

	it('deletes a post missing from the listing with its messages and sync row', async () => {
		await sync();

		fake.postsByChannel.set(
			20,
			fake.postsByChannel.get(20)!.filter((p) => p.id !== 101)
		);
		await sync();

		expect((await db.posts.toArray()).map((p) => p.id).sort()).toEqual([100, 102]);
		expect(await storedIds('post:101')).toEqual([]);
		expect(await db.threadSync.get('post:101')).toBeUndefined();
		expect(await storedIds('post:100')).toHaveLength(4);
	});

	it('catches up a post when its activity changes', async () => {
		await sync();
		fake.push('post:100', 1);
		fake.pageCalls = [];

		await sync();

		expect(fake.pageCalls.map((c) => c.key)).toEqual(['post:100']);
		expect(await storedIds('post:100')).toEqual(fake.ids('post:100').sort());
	});

	it('keeps posts and messages when the post listing fails', async () => {
		await sync();
		fake.posts = async () => {
			throw networkError();
		};

		await expect(sync()).resolves.toBeUndefined();

		expect(await db.posts.count()).toBe(3);
		expect(await storedIds('post:100')).toHaveLength(4);
	});
});

describe('saving data', () => {
	it('fetches only the newest page of each thread', async () => {
		fake.addChannel(1, 10, 8);
		fake.addConversation(5, 8);

		await sync({ fullHistory: false });

		expect(fake.pagesFor('10')).toEqual([null]);
		expect(fake.pagesFor('dm:5')).toEqual([null]);
		expect(await storedIds('10')).toHaveLength(3);
		expect(await db.threadSync.get('10')).toMatchObject({ complete: false, olderCursor: '3' });
	});

	it('continues from where it stopped once full history is allowed', async () => {
		fake.addChannel(1, 10, 8);
		await sync({ fullHistory: false });
		fake.pageCalls = [];

		await sync();

		expect(fake.pagesFor('10')).toEqual(['3', '6']);
		expect((await db.threadSync.get('10'))?.complete).toBe(true);
	});
});

describe('progress', () => {
	it('counts threads with messages and the ones that are complete', async () => {
		fake.addChannel(1, 10, 8);
		fake.addChannel(1, 11, 2);
		fake.addChannel(1, 12, 0);
		const reports: HistoryProgress[] = [];

		await sync({ onProgress: (p) => reports.push(p) });

		expect(reports[0]).toEqual({ threads: 2, complete: 0 });
		expect(reports.at(-1)).toEqual({ threads: 2, complete: 2 });
	});

	it('counts what is already complete when a run starts', async () => {
		fake.addChannel(1, 10, 2);
		await sync();
		const reports: HistoryProgress[] = [];

		await sync({ onProgress: (p) => reports.push(p) });

		expect(reports).toEqual([{ threads: 1, complete: 1 }]);
	});

	it('stops counting a thread that is gone', async () => {
		fake.addChannel(1, 10, 2);
		fake.addChannel(1, 11, 2);
		fake.pageErrors.set('11', httpError(403));
		const reports: HistoryProgress[] = [];

		await sync({ onProgress: (p) => reports.push(p) });

		expect(reports.at(-1)).toEqual({ threads: 1, complete: 1 });
	});
});
