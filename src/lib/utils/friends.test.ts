import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import type { User } from '$lib/types/auth.types';
import type {
	FriendEntry,
	FriendshipFrame,
	FriendshipResult,
	FriendState
} from '$lib/types/friend.types';
import {
	addFriendError,
	addFriendFailure,
	addFriendMessage,
	applyFriendship,
	directRailLabel,
	entriesFromList,
	friendToast,
	friendsEntryLabel,
	newestFirst,
	sortFriends
} from './friends';

const user = (id: number, username = `user${id}`): User => ({
	id,
	username,
	public_key: '',
	profile: {}
});

const entry = (id: number, state: FriendState, since: string, name?: string): FriendEntry => ({
	user: user(id, name),
	state,
	since
});

describe('applyFriendship', () => {
	const T1 = '2026-10-11T10:00:00.000Z';
	const T2 = '2026-10-11T10:00:01.000Z';
	const T3 = '2026-10-11T10:00:02.000Z';

	it('adds an entry nobody knew about', () => {
		const next = applyFriendship({}, { userId: 2, state: 'incoming', user: user(2), at: T1 });
		expect(next[2]).toEqual(entry(2, 'incoming', T1));
	});

	it.each([
		['a newer update', T2, 'friends', 'friends', T2],
		['an update from the same moment', T1, 'friends', 'friends', T1]
	] as const)('changes the entry on %s', (_, at, state, expectedState, expectedSince) => {
		const before = { 2: entry(2, 'outgoing', T1) };
		const next = applyFriendship(before, { userId: 2, state, user: user(2, 'renamed'), at });
		expect(next[2]).toEqual({
			user: user(2, 'renamed'),
			state: expectedState,
			since: expectedSince
		});
		expect(before[2].state).toBe('outgoing');
	});

	it('keeps the known user when the update has none', () => {
		const next = applyFriendship(
			{ 2: entry(2, 'friends', T1) },
			{ userId: 2, state: 'none', at: T2 }
		);
		expect(next[2]).toEqual(entry(2, 'none', T2));
	});

	it('ignores an update older than the entry and returns the same object', () => {
		const entries = { 2: entry(2, 'friends', T2) };
		expect(applyFriendship(entries, { userId: 2, state: 'outgoing', user: user(2), at: T1 })).toBe(
			entries
		);
	});

	it('leaves a removed friend gone when an older frame arrives late', () => {
		let entries: Record<number, FriendEntry> = { 2: entry(2, 'friends', T2) };
		entries = applyFriendship(entries, { userId: 2, state: 'none', user: user(2), at: T3 });
		expect(entries[2].state).toBe('none');

		const late = applyFriendship(entries, { userId: 2, state: 'friends', user: user(2), at: T2 });
		expect(late).toBe(entries);
		expect(late[2].state).toBe('none');
	});

	it('cannot make an entry out of nothing but a removal', () => {
		const entries = {};
		expect(applyFriendship(entries, { userId: 2, state: 'none', at: T1 })).toBe(entries);
	});
});

describe('entriesFromList', () => {
	it('turns the three lists into entries keyed by user', () => {
		const entries = entriesFromList({
			friends: [{ user: user(1), since: '2026-10-01T00:00:00Z' }],
			incoming: [{ user: user(2), created_at: '2026-10-02T00:00:00Z' }],
			outgoing: [{ user: user(3), created_at: '2026-10-03T00:00:00Z' }]
		});
		expect(entries).toEqual({
			1: entry(1, 'friends', '2026-10-01T00:00:00Z'),
			2: entry(2, 'incoming', '2026-10-02T00:00:00Z'),
			3: entry(3, 'outgoing', '2026-10-03T00:00:00Z')
		});
	});
});

describe('sortFriends', () => {
	it('puts people online first, then orders by name ignoring case', () => {
		const list = [
			entry(1, 'friends', '', 'zed'),
			entry(2, 'friends', '', 'Bob'),
			entry(3, 'friends', '', 'amy'),
			entry(4, 'friends', '', 'Cat')
		];
		const online = new Set([1, 4]);
		const sorted = sortFriends(list, (id) => online.has(id));
		expect(sorted.map((e) => e.user.username)).toEqual(['Cat', 'zed', 'amy', 'Bob']);
	});

	it('leaves the input alone', () => {
		const list = [entry(1, 'friends', '', 'b'), entry(2, 'friends', '', 'a')];
		sortFriends(list, () => false);
		expect(list.map((e) => e.user.id)).toEqual([1, 2]);
	});
});

describe('newestFirst', () => {
	it('orders by when the state began', () => {
		const list = [
			entry(1, 'incoming', '2026-10-01T00:00:00Z'),
			entry(2, 'incoming', '2026-10-03T00:00:00Z'),
			entry(3, 'incoming', '2026-10-02T00:00:00Z')
		];
		expect(newestFirst(list).map((e) => e.user.id)).toEqual([2, 3, 1]);
	});
});

describe('friendToast', () => {
	const frame = (patch: Partial<FriendshipFrame>): FriendshipFrame => ({
		type: 'friendship_updated',
		user_id: 2,
		state: 'incoming',
		reason: 'requested',
		actor_id: 2,
		user: user(2, 'bob'),
		created_at: '2026-10-11T10:00:00Z',
		...patch
	});

	it.each([
		[
			'a request to me',
			{ reason: 'requested', state: 'incoming' },
			'bob sent you a friend request'
		],
		[
			'an accepted request',
			{ reason: 'accepted', state: 'friends' },
			'bob accepted your friend request'
		],
		['crossed requests', { reason: 'crossed', state: 'friends' }, 'You and bob are now friends']
	] as const)('says something for %s', (_, patch, message) => {
		expect(friendToast(frame(patch), 1)?.message).toBe(message);
	});

	it('offers to view only the requests', () => {
		expect(friendToast(frame({}), 1)?.viewRequests).toBe(true);
		expect(friendToast(frame({ reason: 'accepted', state: 'friends' }), 1)?.viewRequests).toBe(
			false
		);
	});

	it.each([
		['declined', 'none'],
		['cancelled', 'none'],
		['removed', 'none']
	] as const)('stays quiet when someone %s', (reason, state) => {
		expect(friendToast(frame({ reason, state }), 1)).toBeNull();
	});

	it.each(['requested', 'accepted', 'crossed'] as const)(
		'stays quiet for what I did myself (%s)',
		(reason) => {
			const state = reason === 'requested' ? 'outgoing' : 'friends';
			expect(friendToast(frame({ reason, state, actor_id: 1 }), 1)).toBeNull();
		}
	);
});

describe('labels', () => {
	it.each([
		[0, 0, 'Direct messages'],
		[3, 0, 'Direct messages, 3 unread'],
		[0, 1, 'Direct messages, 1 friend request'],
		[2, 3, 'Direct messages, 2 unread, 3 friend requests']
	])('names the rail entry for %i unread and %i requests', (unread, requests, label) => {
		expect(directRailLabel(unread, requests)).toBe(label);
	});

	it.each([
		[0, 'Friends'],
		[1, 'Friends, 1 request'],
		[4, 'Friends, 4 requests']
	])('names the friends entry for %i requests', (requests, label) => {
		expect(friendsEntryLabel(requests)).toBe(label);
	});
});

describe('add by username', () => {
	const result = (state: FriendshipResult['state']): FriendshipResult => ({
		user: user(2, 'bob'),
		state,
		created_at: '2026-10-11T10:00:00Z'
	});

	it.each([
		['none', 'friends', 'You and bob are now friends.'],
		['incoming', 'friends', 'You and bob are now friends.'],
		['friends', 'friends', 'You and bob are already friends.'],
		['none', 'outgoing', 'Friend request sent to bob.'],
		['outgoing', 'outgoing', 'You already sent bob a request.']
	] as const)('says what happened going from %s to %s', (before, state, message) => {
		expect(addFriendMessage('bob', before, result(state))).toBe(message);
	});

	it.each([
		[400, 'You can’t add yourself.'],
		[404, 'No one is called “bob”. Usernames are case-sensitive.'],
		[429, 'fallback'],
		[null, 'fallback']
	])('explains a %s', (status, message) => {
		expect(addFriendError('bob', status, 'fallback')).toBe(message);
	});

	it('reads the status off a thrown error', () => {
		const response = {
			status: 404,
			data: { detail: 'User not found' },
			statusText: '',
			headers: {},
			config: { headers: new AxiosHeaders() }
		};
		const error = new AxiosError('failed', 'ERR', undefined, undefined, response);
		expect(addFriendFailure('bob', error)).toBe(
			'No one is called “bob”. Usernames are case-sensitive.'
		);
		expect(addFriendFailure('bob', new Error('boom'))).toBe('boom');
	});
});
