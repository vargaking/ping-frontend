import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
	get: vi.fn(),
	send: vi.fn(),
	accept: vi.fn(),
	decline: vi.fn(),
	cancel: vi.fn(),
	remove: vi.fn()
}));
vi.mock('$lib/requests/friends/getFriends', () => ({ getFriends: api.get }));
vi.mock('$lib/requests/friends/sendFriendRequest', () => ({ sendFriendRequest: api.send }));
vi.mock('$lib/requests/friends/acceptFriendRequest', () => ({ acceptFriendRequest: api.accept }));
vi.mock('$lib/requests/friends/declineFriendRequest', () => ({
	declineFriendRequest: api.decline
}));
vi.mock('$lib/requests/friends/cancelFriendRequest', () => ({ cancelFriendRequest: api.cancel }));
vi.mock('$lib/requests/friends/removeFriend', () => ({ removeFriend: api.remove }));

import type { User } from '$lib/types/auth.types';
import type { FriendsList, FriendshipFrame } from '$lib/types/friend.types';
import { FriendsState } from './friendsState.svelte';
import { usersState } from './usersState.svelte';

const T1 = '2026-10-11T10:00:00.000Z';
const T2 = '2026-10-11T10:00:05.000Z';
const T3 = '2026-10-11T10:00:09.000Z';

const user = (id: number): User => ({ id, username: `user${id}`, public_key: '', profile: {} });

const list = (patch: Partial<FriendsList> = {}): FriendsList => ({
	friends: [],
	incoming: [],
	outgoing: [],
	...patch
});

const frame = (patch: Partial<FriendshipFrame>): FriendshipFrame => ({
	type: 'friendship_updated',
	user_id: 2,
	state: 'incoming',
	reason: 'requested',
	actor_id: 2,
	user: user(2),
	created_at: T2,
	...patch
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

function httpError(status: number) {
	return new AxiosError('failed', 'ERR', undefined, undefined, {
		status,
		data: {},
		statusText: '',
		headers: {},
		config: { headers: new AxiosHeaders() }
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	usersState.reset();
});

describe('fetch', () => {
	it('lists friends and requests, and counts the incoming ones', async () => {
		api.get.mockResolvedValue(
			list({
				friends: [{ user: user(1), since: T1 }],
				incoming: [
					{ user: user(2), created_at: T1 },
					{ user: user(3), created_at: T2 }
				],
				outgoing: [{ user: user(4), created_at: T1 }]
			})
		);
		const friends = new FriendsState();
		await friends.fetch();

		expect(friends.loaded).toBe(true);
		expect(friends.friends.map((e) => e.user.id)).toEqual([1]);
		expect(friends.outgoing.map((e) => e.user.id)).toEqual([4]);
		expect(friends.incomingCount).toBe(2);
		expect(friends.stateOf(2)).toBe('incoming');
		expect(friends.stateOf(99)).toBe('none');
		expect(usersState.users[4]).toEqual(user(4));
	});

	it('reports a failure without throwing', async () => {
		api.get.mockRejectedValue(new Error('offline'));
		const friends = new FriendsState();
		await expect(friends.fetch()).resolves.toBeUndefined();
		expect(friends.loadFailed).toBe(true);
		expect(friends.loaded).toBe(false);
	});

	it('keeps a frame that lands while the response is in flight', async () => {
		const response = deferred<FriendsList>();
		api.get.mockReturnValue(response.promise);
		const friends = new FriendsState();
		const loading = friends.fetch();

		expect(friends.applyFrame(frame({ user_id: 2, created_at: T2 }))).toBe(true);
		response.resolve(list({ incoming: [{ user: user(3), created_at: T1 }] }));
		await loading;

		expect(friends.incoming.map((e) => e.user.id).sort()).toEqual([2, 3]);
	});

	it('keeps a removal that lands while the response is in flight', async () => {
		const response = deferred<FriendsList>();
		api.get.mockReturnValue(response.promise);
		const friends = new FriendsState();
		const loading = friends.fetch();

		friends.applyFrame(frame({ state: 'none', reason: 'removed', created_at: T2 }));
		response.resolve(list({ friends: [{ user: user(2), since: T1 }] }));
		await loading;

		expect(friends.stateOf(2)).toBe('none');
		expect(friends.friends).toEqual([]);
	});

	it('drops an older response that an overlapping fetch has overtaken', async () => {
		const older = deferred<FriendsList>();
		const newer = deferred<FriendsList>();
		api.get.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
		const friends = new FriendsState();
		const first = friends.fetch();
		const second = friends.fetch();

		newer.resolve(list({ friends: [{ user: user(2), since: T1 }] }));
		await second;
		older.resolve(list({ friends: [{ user: user(9), since: T1 }] }));
		await first;

		expect(friends.friends.map((e) => e.user.id)).toEqual([2]);
	});

	it('drops a response that arrives after a reset', async () => {
		const response = deferred<FriendsList>();
		api.get.mockReturnValue(response.promise);
		const friends = new FriendsState();
		const loading = friends.fetch();

		friends.reset();
		response.resolve(list({ friends: [{ user: user(2), since: T1 }] }));
		await loading;

		expect(friends.loaded).toBe(false);
		expect(friends.friends).toEqual([]);
	});
});

describe('frames', () => {
	it('ignores a frame older than what it already knows', () => {
		const friends = new FriendsState();
		expect(
			friends.applyFrame(frame({ state: 'friends', reason: 'accepted', created_at: T2 }))
		).toBe(true);
		expect(friends.applyFrame(frame({ state: 'incoming', created_at: T1 }))).toBe(false);
		expect(friends.stateOf(2)).toBe('friends');
	});

	it('shares the other user with the rest of the app', () => {
		new FriendsState().applyFrame(frame({ user: { ...user(2), username: 'renamed' } }));
		expect(usersState.users[2].username).toBe('renamed');
	});
});

describe('actions', () => {
	async function withIncoming() {
		api.get.mockResolvedValue(list({ incoming: [{ user: user(2), created_at: T1 }] }));
		const friends = new FriendsState();
		await friends.fetch();
		return friends;
	}

	it('takes the result of sending a request', async () => {
		api.send.mockResolvedValue({ user: user(2), state: 'outgoing', created_at: T1 });
		const friends = new FriendsState();
		await friends.request({ username: 'user2' });
		expect(api.send).toHaveBeenCalledWith({ username: 'user2' });
		expect(friends.stateOf(2)).toBe('outgoing');
		expect(friends.stateOfName('user2')).toBe('outgoing');
	});

	it('takes the result of accepting', async () => {
		const friends = await withIncoming();
		api.accept.mockResolvedValue({ user: user(2), state: 'friends', created_at: T2 });
		await friends.accept(2);
		expect(friends.friends.map((e) => e.user.id)).toEqual([2]);
		expect(friends.incomingCount).toBe(0);
	});

	it('refetches and says so when the request to accept is gone', async () => {
		const friends = await withIncoming();
		api.accept.mockRejectedValue(httpError(404));
		api.get.mockResolvedValue(list());

		await expect(friends.accept(2)).rejects.toThrow('That friend request is no longer there.');
		expect(friends.stateOf(2)).toBe('none');
	});

	it('passes on other accept failures untouched', async () => {
		const friends = await withIncoming();
		const failure = httpError(500);
		api.accept.mockRejectedValue(failure);
		await expect(friends.accept(2)).rejects.toBe(failure);
		expect(friends.stateOf(2)).toBe('incoming');
	});

	it.each<['decline' | 'cancel' | 'remove', Partial<FriendsList>, string]>([
		['decline', { incoming: [{ user: user(2), created_at: T1 }] }, 'incoming'],
		['cancel', { outgoing: [{ user: user(2), created_at: T1 }] }, 'outgoing'],
		['remove', { friends: [{ user: user(2), since: T1 }] }, 'friends']
	])('%s clears the entry', async (action, seed, state) => {
		api.get.mockResolvedValue(list(seed));
		const friends = new FriendsState();
		await friends.fetch();
		expect(friends.stateOf(2)).toBe(state);
		api[action].mockResolvedValue(undefined);

		await friends[action](2);

		expect(api[action]).toHaveBeenCalledWith(2);
		expect(friends.stateOf(2)).toBe('none');
	});

	it('does not delete a newer entry when a decline answers late', async () => {
		const friends = await withIncoming();
		const answer = deferred<void>();
		api.decline.mockReturnValue(answer.promise);

		const declining = friends.decline(2);
		friends.applyFrame(frame({ state: 'friends', reason: 'accepted', created_at: T3 }));
		answer.resolve();
		await declining;

		expect(friends.stateOf(2)).toBe('friends');
	});

	it('does not clear anything for a user it does not know', async () => {
		api.cancel.mockResolvedValue(undefined);
		const friends = new FriendsState();
		await friends.cancel(7);
		expect(friends.stateOf(7)).toBe('none');
	});
});

describe('reset', () => {
	it('forgets everything', async () => {
		api.get.mockResolvedValue(list({ friends: [{ user: user(1), since: T1 }] }));
		const friends = new FriendsState();
		await friends.fetch();

		friends.reset();

		expect(friends.entries).toEqual({});
		expect(friends.loaded).toBe(false);
		expect(friends.loadFailed).toBe(false);
	});
});
