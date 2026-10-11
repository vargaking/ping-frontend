import { beforeEach, describe, expect, it, vi } from 'vitest';

const requests = vi.hoisted(() => ({
	posts: vi.fn(),
	post: vi.fn(),
	tags: vi.fn()
}));

vi.mock('$lib/requests/forum/getForumPosts', () => ({ getForumPosts: requests.posts }));
vi.mock('$lib/requests/forum/getForumPost', () => ({ getForumPost: requests.post }));
vi.mock('$lib/requests/forum/getForumTags', () => ({ getForumTags: requests.tags }));

import { forumState } from './forumState.svelte';

beforeEach(async () => {
	forumState.reset();
	requests.posts.mockReset().mockResolvedValue({ posts: [], next_cursor: null });
	requests.tags.mockReset().mockResolvedValue([]);
	forumState.open(1);
	forumState.open(2);
	await vi.waitFor(() => expect(forumState.index(2)?.status).toBe('ready'));
	requests.posts.mockClear();
	requests.tags.mockClear();
});

describe('refreshChannels', () => {
	it('reloads tags and posts of the listed channels that are loaded', async () => {
		forumState.refreshChannels([2, 3]);

		await vi.waitFor(() => expect(requests.posts).toHaveBeenCalledTimes(1));
		expect(requests.posts).toHaveBeenCalledWith(2, []);
		expect(requests.tags).toHaveBeenCalledExactlyOnceWith(2);
	});

	it('reloads every loaded channel when none are named', async () => {
		forumState.refreshChannels(null);

		await vi.waitFor(() => expect(requests.posts).toHaveBeenCalledTimes(2));
		expect(requests.tags).toHaveBeenCalledTimes(2);
	});

	it('does not open channels that were never loaded', async () => {
		forumState.refreshChannels([3]);

		expect(forumState.index(3)).toBeUndefined();
		expect(requests.posts).not.toHaveBeenCalled();
		expect(requests.tags).not.toHaveBeenCalled();
	});
});
