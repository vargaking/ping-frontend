import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredMessage, StoredPost } from '$lib/types/localHistory.types';
import { findMessageIds, findPosts, loadMessages } from '$lib/utils/messageSearch';
import { tokenize } from '$lib/utils/searchText';
import { conversationsState } from './conversationsState.svelte';
import { searchState } from './searchState.svelte';
import { unreadState } from './unreadState.svelte';

vi.mock('$lib/utils/messageSearch', () => ({
	queryTokens: (query: string) => tokenize(query),
	findMessageIds: vi.fn(),
	findPosts: vi.fn(),
	loadMessages: vi.fn()
}));

const findIds = vi.mocked(findMessageIds);
const findPostRows = vi.mocked(findPosts);
const loadRows = vi.mocked(loadMessages);

function channelMessage(id: string, channelId = 10): StoredMessage {
	return { id, channel_id: channelId, server_id: 1, user_id: 1 } as StoredMessage;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

const idsOf = (count: number, prefix = 'm') =>
	Array.from({ length: count }, (_, i) => `${prefix}${i}`);

beforeEach(() => {
	vi.useFakeTimers();
	findIds.mockReset().mockResolvedValue([]);
	findPostRows.mockReset().mockResolvedValue([]);
	loadRows.mockReset().mockImplementation(async (ids) => ids.map((id) => channelMessage(id, 10)));
	unreadState.noteNewChannel(1, { id: 10, name: 'general', type: 'text' } as never);
	unreadState.noteNewChannel(1, { id: 20, name: 'forum', type: 'forum' } as never);
});

afterEach(() => {
	searchState.reset();
	unreadState.reset();
	conversationsState.reset();
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
