import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredMessage, StoredPost } from '$lib/types/localHistory.types';
import type { User } from '$lib/types/auth.types';
import {
	findMessageIds,
	findPosts,
	loadMessages,
	pageMessages,
	storedUserIds,
	type MessagePager
} from '$lib/utils/messageSearch';
import { conversationsState } from './conversationsState.svelte';
import { searchState } from './searchState.svelte';
import { unreadState } from './unreadState.svelte';
import { usersState } from './usersState.svelte';

vi.mock('$lib/utils/messageSearch', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/utils/messageSearch')>()),
	findMessageIds: vi.fn(),
	findPosts: vi.fn(),
	loadMessages: vi.fn(),
	pageMessages: vi.fn(),
	storedUserIds: vi.fn()
}));

const findIds = vi.mocked(findMessageIds);
const storedIds = vi.mocked(storedUserIds);
const findPostRows = vi.mocked(findPosts);
const loadRows = vi.mocked(loadMessages);
const pageRows = vi.mocked(pageMessages);

function channelMessage(id: string, channelId = 10): StoredMessage {
	return { id, channel_id: channelId, server_id: 1, user_id: 1 } as StoredMessage;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

/** A pager that hands out visible channel messages with these ids. */
function pagerOf(ids: string[], make = (id: string) => channelMessage(id)) {
	const queue = [...ids];
	const next = vi.fn(async (n: number) => queue.splice(0, n).map(make));
	return { pager: { next } satisfies MessagePager, next };
}

const idsOf = (count: number, prefix = 'm') =>
	Array.from({ length: count }, (_, i) => `${prefix}${i}`);

beforeEach(() => {
	vi.useFakeTimers();
	findIds.mockReset().mockResolvedValue([]);
	pageRows.mockReset().mockResolvedValue(pagerOf([]).pager);
	findPostRows.mockReset().mockResolvedValue([]);
	storedIds.mockReset().mockResolvedValue([]);
	loadRows.mockReset().mockImplementation(async (ids) => ids.map((id) => channelMessage(id, 10)));
	unreadState.noteNewChannel(1, { id: 10, name: 'general', type: 'text' } as never);
	unreadState.noteNewChannel(1, { id: 20, name: 'forum', type: 'forum' } as never);
});

afterEach(() => {
	searchState.reset();
	usersState.reset();
	unreadState.reset();
	conversationsState.reset();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('searchState', () => {
	it('waits 120 ms after the last keystroke, then searches once', async () => {
		searchState.setQuery('mi');
		await vi.advanceTimersByTimeAsync(100);
		searchState.setQuery('mir');
		await vi.advanceTimersByTimeAsync(100);
		expect(findIds).not.toHaveBeenCalled();
		expect(searchState.status).toBe('searching');

		await vi.advanceTimersByTimeAsync(20);
		expect(findIds).toHaveBeenCalledTimes(1);
		expect(findIds).toHaveBeenCalledWith(['mir'], { kind: 'everywhere' });
		expect(searchState.status).toBe('ready');
	});

	it('stays idle for a query without searchable words', async () => {
		searchState.setQuery('a');
		await vi.advanceTimersByTimeAsync(500);
		expect(findIds).not.toHaveBeenCalled();
		expect(searchState.status).toBe('idle');
	});

	it('clears results when the query is emptied', async () => {
		findIds.mockResolvedValue(['a']);
		searchState.setQuery('abc');
		await vi.advanceTimersByTimeAsync(120);
		expect(searchState.hits).toHaveLength(1);

		searchState.setQuery('');
		expect(searchState.hits).toEqual([]);
		expect(searchState.total).toBe(0);
		expect(searchState.status).toBe('idle');
	});

	it('shows the count and the first page', async () => {
		findIds.mockResolvedValue(idsOf(70));
		searchState.setQuery('abc');
		await vi.advanceTimersByTimeAsync(120);

		expect(searchState.total).toBe(70);
		expect(searchState.hits).toHaveLength(30);
		expect(searchState.hasMore).toBe(true);
		expect(searchState.tokens).toEqual(['abc']);
	});

	it('does not let an older search overwrite a newer one that finished first', async () => {
		const slow = deferred<string[]>();
		findIds.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(['new']);

		searchState.setQuery('first');
		await vi.advanceTimersByTimeAsync(120);
		searchState.setQuery('second');
		await vi.advanceTimersByTimeAsync(120);
		expect(searchState.hits.map((h) => h.id)).toEqual(['new']);

		slow.resolve(['old1', 'old2']);
		await vi.advanceTimersByTimeAsync(0);
		expect(searchState.hits.map((h) => h.id)).toEqual(['new']);
		expect(searchState.total).toBe(1);
		expect(searchState.status).toBe('ready');
	});

	it('searches again at once when the scope changes', async () => {
		searchState.setQuery('abc');
		await vi.advanceTimersByTimeAsync(120);
		searchState.setScope({ kind: 'channel', channelId: 10 });
		await vi.advanceTimersByTimeAsync(0);

		expect(findIds).toHaveBeenLastCalledWith(['abc'], { kind: 'channel', channelId: 10 });
		searchState.setScope({ kind: 'channel', channelId: 10 });
		await vi.advanceTimersByTimeAsync(500);
		expect(findIds).toHaveBeenCalledTimes(2);
	});

	describe('filters', () => {
		const user = (id: number, username: string) => ({ id, username }) as User;

		it('searches on filters alone and exposes the has: filters', async () => {
			pageRows.mockResolvedValue(pagerOf(['a']).pager);
			searchState.setQuery('has:image has:file');
			await vi.advanceTimersByTimeAsync(120);

			expect(pageRows).toHaveBeenCalledWith(
				[],
				{ kind: 'everywhere' },
				{
					fromKeys: null,
					has: ['image', 'file'],
					since: null,
					until: null
				}
			);
			expect(findPostRows).toHaveBeenCalledWith([], { kind: 'everywhere' }, 25, expect.anything());
			expect(searchState.hits).toHaveLength(1);
			expect(searchState.has).toEqual(['image', 'file']);

			searchState.setQuery('');
			expect(searchState.has).toEqual([]);
		});

		it('turns a loaded username into author keys without fetching profiles', async () => {
			usersState.applyUser(user(5, 'Dáni'));
			const fetchUser = vi.spyOn(usersState, 'getOrFetchUser');
			searchState.setQuery('from:dani');
			await vi.advanceTimersByTimeAsync(120);

			expect(pageRows.mock.calls[0][2]?.fromKeys).toEqual(['name:dani', 'user:5']);
			expect(storedIds).not.toHaveBeenCalled();
			expect(fetchUser).not.toHaveBeenCalled();
		});

		it('fetches the profiles of stored authors it does not know, once', async () => {
			storedIds.mockResolvedValue([5, 6]);
			usersState.applyUser(user(6, 'someone'));
			const fetchUser = vi.spyOn(usersState, 'getOrFetchUser').mockImplementation(async (id) => {
				usersState.applyUser(user(id, 'Gone'));
				return usersState.users[id];
			});

			searchState.setQuery('from:gone');
			await vi.advanceTimersByTimeAsync(120);
			expect(fetchUser).toHaveBeenCalledTimes(1);
			expect(fetchUser).toHaveBeenCalledWith(5);
			expect(pageRows.mock.calls[0][2]?.fromKeys).toEqual(['name:gone', 'user:5']);

			searchState.setQuery('from:nobody');
			await vi.advanceTimersByTimeAsync(120);
			expect(fetchUser).toHaveBeenCalledTimes(1);
			expect(pageRows.mock.calls[1][2]?.fromKeys).toEqual(['name:nobody']);
		});

		it('tries a profile that failed to load again on the next search', async () => {
			storedIds.mockResolvedValue([9]);
			const fetchUser = vi
				.spyOn(usersState, 'getOrFetchUser')
				.mockRejectedValue(new Error('offline'));

			searchState.setQuery('from:ghost');
			await vi.advanceTimersByTimeAsync(120);
			searchState.setQuery('from:ghost x1');
			await vi.advanceTimersByTimeAsync(120);

			expect(fetchUser).toHaveBeenCalledTimes(2);
			expect(searchState.status).toBe('ready');
		});

		it('waits for profiles an earlier search is still fetching', async () => {
			storedIds.mockResolvedValue([5]);
			const profile = deferred<null>();
			const fetchUser = vi.spyOn(usersState, 'getOrFetchUser').mockImplementation(async () => {
				await profile.promise;
				usersState.applyUser(user(5, 'Dani'));
				return usersState.users[5];
			});

			searchState.setQuery('from:d');
			await vi.advanceTimersByTimeAsync(120);
			searchState.setQuery('from:dani');
			await vi.advanceTimersByTimeAsync(120);
			profile.resolve(null);
			await vi.advanceTimersByTimeAsync(0);

			expect(fetchUser).toHaveBeenCalledTimes(1);
			expect(pageRows).toHaveBeenCalledTimes(1);
			expect(pageRows.mock.calls[0][2]?.fromKeys).toEqual(['name:dani', 'user:5']);
		});

		it('lets a newer query win while an author is still being resolved', async () => {
			const slow = deferred<number[]>();
			storedIds.mockReturnValueOnce(slow.promise);
			findIds.mockResolvedValue(['new']);

			searchState.setQuery('from:slow');
			await vi.advanceTimersByTimeAsync(120);
			searchState.setQuery('abc');
			await vi.advanceTimersByTimeAsync(120);
			expect(searchState.hits.map((h) => h.id)).toEqual(['new']);

			slow.resolve([]);
			await vi.advanceTimersByTimeAsync(0);
			expect(findIds).toHaveBeenCalledTimes(1);
			expect(pageRows).not.toHaveBeenCalled();
			expect(searchState.tokens).toEqual(['abc']);
		});

		it('searches words with a filter lazily and does not count', async () => {
			pageRows.mockResolvedValue(pagerOf(idsOf(5)).pager);
			searchState.setQuery('abc has:file');
			await vi.advanceTimersByTimeAsync(120);

			expect(pageRows).toHaveBeenCalledWith(['abc'], { kind: 'everywhere' }, expect.anything());
			expect(findIds).not.toHaveBeenCalled();
			expect(searchState.total).toBeNull();
			expect(searchState.tokens).toEqual(['abc']);
			expect(searchState.hits).toHaveLength(5);
			expect(searchState.hasMore).toBe(false);
		});

		it('pages a filter-only search from the pager, 30 rows at a time', async () => {
			const { pager, next } = pagerOf(idsOf(70));
			pageRows.mockResolvedValue(pager);
			searchState.setQuery('has:image');
			await vi.advanceTimersByTimeAsync(120);

			expect(findIds).not.toHaveBeenCalled();
			expect(searchState.total).toBeNull();
			expect(searchState.hits).toHaveLength(30);
			expect(searchState.hasMore).toBe(true);

			await searchState.loadMore();
			expect(searchState.hits).toHaveLength(60);
			expect(searchState.hits[30].id).toBe('m30');
			expect(searchState.total).toBeNull();
			expect(searchState.hasMore).toBe(true);

			await searchState.loadMore();
			expect(searchState.hits).toHaveLength(70);
			expect(searchState.hasMore).toBe(false);

			const calls = next.mock.calls.length;
			await searchState.loadMore();
			expect(next.mock.calls.length).toBe(calls);
		});

		it('keeps asking the pager when a page is hidden, and stops when it runs out', async () => {
			const { pager } = pagerOf(idsOf(40), (id) =>
				channelMessage(id, Number(id.slice(1)) < 30 ? 99 : 10)
			);
			pageRows.mockResolvedValue(pager);
			searchState.setQuery('has:image');
			await vi.advanceTimersByTimeAsync(120);

			expect(searchState.hits).toHaveLength(10);
			expect(searchState.hasMore).toBe(false);
		});

		it('drops a pager page that arrives after a newer search began', async () => {
			const { pager, next } = pagerOf(idsOf(70));
			pageRows.mockResolvedValueOnce(pager);
			findIds.mockResolvedValue(['fresh']);
			searchState.setQuery('has:image');
			await vi.advanceTimersByTimeAsync(120);

			const late = deferred<StoredMessage[]>();
			next.mockReturnValueOnce(late.promise);
			const loading = searchState.loadMore();
			searchState.setQuery('abc');
			await vi.advanceTimersByTimeAsync(120);
			late.resolve([channelMessage('stale')]);
			await loading;

			expect(searchState.hits.map((h) => h.id)).toEqual(['fresh']);
			expect(searchState.total).toBe(1);
		});

		it('lets a newer search win over a filtered one still reading', async () => {
			const slow = deferred<MessagePager>();
			pageRows.mockReturnValueOnce(slow.promise);
			findIds.mockResolvedValue(['new']);
			searchState.setQuery('has:image');
			await vi.advanceTimersByTimeAsync(120);
			searchState.setQuery('abc');
			await vi.advanceTimersByTimeAsync(120);

			slow.resolve(pagerOf(['old']).pager);
			await vi.advanceTimersByTimeAsync(0);
			expect(searchState.hits.map((h) => h.id)).toEqual(['new']);
			expect(searchState.total).toBe(1);
			expect(searchState.has).toEqual([]);
		});
	});

	describe('loadMore', () => {
		it('loads 30 more rows at a time and stops at the end', async () => {
			findIds.mockResolvedValue(idsOf(70));
			searchState.setQuery('abc');
			await vi.advanceTimersByTimeAsync(120);

			await searchState.loadMore();
			expect(searchState.hits).toHaveLength(60);
			expect(searchState.hits[30].id).toBe('m30');
			expect(searchState.hasMore).toBe(true);

			await searchState.loadMore();
			expect(searchState.hits).toHaveLength(70);
			expect(searchState.hasMore).toBe(false);

			const calls = loadRows.mock.calls.length;
			await searchState.loadMore();
			expect(loadRows.mock.calls.length).toBe(calls);
		});

		it('ignores a second call while one is running', async () => {
			findIds.mockResolvedValue(idsOf(70));
			searchState.setQuery('abc');
			await vi.advanceTimersByTimeAsync(120);

			await Promise.all([searchState.loadMore(), searchState.loadMore()]);
			expect(searchState.hits).toHaveLength(60);
		});

		it('drops a page that arrives after a newer search began', async () => {
			findIds.mockResolvedValueOnce(idsOf(70)).mockResolvedValueOnce(['fresh']);
			searchState.setQuery('abc');
			await vi.advanceTimersByTimeAsync(120);

			const late = deferred<StoredMessage[]>();
			loadRows.mockReturnValueOnce(late.promise);
			const loading = searchState.loadMore();
			searchState.setQuery('abcd');
			await vi.advanceTimersByTimeAsync(120);
			late.resolve([channelMessage('stale')]);
			await loading;

			expect(searchState.hits.map((h) => h.id)).toEqual(['fresh']);
		});
	});

	describe('what the person can no longer see', () => {
		it('drops message hits from channels the app does not know', async () => {
			findIds.mockResolvedValue(['a', 'b', 'c']);
			loadRows.mockImplementation(async (ids) =>
				ids.map((id) => channelMessage(id, id === 'b' ? 99 : 10))
			);
			searchState.setQuery('abc');
			await vi.advanceTimersByTimeAsync(120);

			expect(searchState.hits.map((h) => h.id)).toEqual(['a', 'c']);
			expect(searchState.total).toBe(2);
		});

		it('keeps direct messages only for known conversations', async () => {
			conversationsState.conversations = { 7: { id: 7 } as never };
			findIds.mockResolvedValue(['dm7', 'dm8']);
			loadRows.mockImplementation(async (ids) =>
				ids.map(
					(id) =>
						({
							id,
							channel_id: null,
							conversation_id: id === 'dm7' ? 7 : 8
						}) as StoredMessage
				)
			);
			searchState.setQuery('abc');
			await vi.advanceTimersByTimeAsync(120);

			expect(searchState.hits.map((h) => h.id)).toEqual(['dm7']);
		});

		it('keeps loading when a whole page is hidden', async () => {
			const ids = idsOf(40);
			findIds.mockResolvedValue(ids);
			loadRows.mockImplementation(async (chunk) =>
				chunk.map((id) => channelMessage(id, Number(id.slice(1)) < 30 ? 99 : 10))
			);
			searchState.setQuery('abc');
			await vi.advanceTimersByTimeAsync(120);

			expect(searchState.hits).toHaveLength(10);
			expect(searchState.total).toBe(10);
			expect(searchState.hasMore).toBe(false);
		});

		it('drops ids that are no longer stored', async () => {
			findIds.mockResolvedValue(['a', 'gone']);
			loadRows.mockResolvedValue([channelMessage('a')]);
			searchState.setQuery('abc');
			await vi.advanceTimersByTimeAsync(120);

			expect(searchState.total).toBe(1);
		});

		it('drops post hits from unknown channels and shows at most five', async () => {
			const post = (id: number, channelId: number) => ({ id, channel_id: channelId }) as StoredPost;
			findPostRows.mockResolvedValue([
				post(1, 99),
				post(2, 20),
				post(3, 20),
				post(4, 20),
				post(5, 20),
				post(6, 20),
				post(7, 20)
			]);
			searchState.setQuery('abc');
			await vi.advanceTimersByTimeAsync(120);

			expect(searchState.posts.map((p) => p.id)).toEqual([2, 3, 4, 5, 6]);
		});
	});

	it('reset clears the query, scope and results and cancels a pending search', async () => {
		findIds.mockResolvedValue(['a']);
		searchState.setScope({ kind: 'server', serverId: 1 });
		searchState.setQuery('abc');
		await vi.advanceTimersByTimeAsync(120);
		searchState.setQuery('abcd');

		searchState.reset();
		await vi.advanceTimersByTimeAsync(500);

		expect(searchState.query).toBe('');
		expect(searchState.scope).toEqual({ kind: 'everywhere' });
		expect(searchState.hits).toEqual([]);
		expect(searchState.status).toBe('idle');
		expect(findIds).toHaveBeenCalledTimes(1);
	});

	it('reset drops a search that is still running', async () => {
		const slow = deferred<string[]>();
		findIds.mockReturnValue(slow.promise);
		searchState.setQuery('abc');
		await vi.advanceTimersByTimeAsync(120);

		searchState.reset();
		slow.resolve(['a']);
		await vi.advanceTimersByTimeAsync(0);

		expect(searchState.hits).toEqual([]);
		expect(searchState.status).toBe('idle');
	});

	it('shows an empty result when the search fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		findIds.mockRejectedValue(new Error('broken'));
		searchState.setQuery('abc');
		await vi.advanceTimersByTimeAsync(120);

		expect(searchState.status).toBe('ready');
		expect(searchState.total).toBe(0);
		warn.mockRestore();
	});
});
