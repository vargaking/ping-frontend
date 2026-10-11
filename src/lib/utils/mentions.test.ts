import { beforeEach, describe, expect, it } from 'vitest';
import { conversationsState } from '$lib/states/conversationsState.svelte';
import { serversState } from '$lib/states/serversState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import type { User } from '$lib/types/auth.types';
import type { Channel } from '$lib/types/channel.types';
import { mentionCandidates, mentionSuggestions } from './mentions';

const user = (id: number, username: string): User => ({
	id,
	username,
	public_key: '',
	profile: {}
});
const ann = user(1, 'ann');
const bo = user(2, 'bo');
const cy = user(3, 'cy');

const channel = (id: number, isPrivate: boolean): Channel => ({
	id,
	name: `c${id}`,
	type: 'text',
	topic: null,
	group_id: null,
	position: 0,
	channel_settings: {},
	private: isPrivate
});

beforeEach(() => {
	serversState.reset();
	usersState.reset();
	conversationsState.conversations = {};
	serversState.servers = { 7: { id: 7, name: 'ping', members: [ann, bo, cy] } };
	serversState.channels = { 7: { 10: channel(10, false), 11: channel(11, true) } };
});

describe('mentionCandidates', () => {
	it.each([
		['a public channel', { channelId: 10 }, undefined, [ann, bo, cy]],
		['a private channel whose viewers are not loaded', { channelId: 11 }, undefined, [ann, bo, cy]],
		['a private channel', { channelId: 11 }, [1, 3], [ann, cy]],
		['a private channel only one member can view', { channelId: 11 }, [2], [bo]],
		['a public channel with leftover viewers', { channelId: 10 }, [1], [ann, bo, cy]],
		['a server without a channel', {}, undefined, [ann, bo, cy]]
	])('lists the right members in %s', (_name, where, viewers, expected) => {
		if (viewers) serversState.channelViewers = { [where.channelId ?? 0]: viewers };

		expect(mentionCandidates({ serverId: 7, ...where })).toEqual(expected);
	});

	it('follows members who join or leave', () => {
		serversState.addMember(7, user(4, 'di'));
		serversState.removeMember(7, 1);

		expect(mentionCandidates({ serverId: 7, channelId: 10 }).map((u) => u.id)).toEqual([2, 3, 4]);
	});

	it('follows a viewer who gains access to a private channel', () => {
		serversState.channelViewers = { 11: [1] };
		expect(mentionCandidates({ serverId: 7, channelId: 11 })).toEqual([ann]);

		serversState.channelViewers[11] = [1, 2];

		expect(mentionCandidates({ serverId: 7, channelId: 11 })).toEqual([ann, bo]);
	});

	it('offers the other participant of a conversation', () => {
		conversationsState.conversations = {
			5: { id: 5, other_user: bo }
		} as unknown as typeof conversationsState.conversations;

		expect(mentionCandidates({ conversationId: 5 })).toEqual([bo]);
	});

	it.each([
		['an unknown conversation', { conversationId: 99 }],
		['no target', {}]
	])('offers nobody for %s', (_name, target) => {
		expect(mentionCandidates(target)).toEqual([]);
	});
});

describe('mentionSuggestions', () => {
	it.each([
		['an empty query', '', ['ann', 'bo', 'cy']],
		['a prefix', 'a', ['ann']],
		['a prefix in another case', 'B', ['bo']],
		['no match', 'z', []]
	])('filters by %s', (_name, query, expected) => {
		expect(mentionSuggestions([ann, bo, cy], query).map((u) => u.username)).toEqual(expected);
	});

	it('shows a renamed user under the new name', () => {
		usersState.users[2] = user(2, 'robin');

		expect(mentionSuggestions([ann, bo, cy], 'ro').map((u) => u.username)).toEqual(['robin']);
		expect(mentionSuggestions([ann, bo, cy], 'bo')).toEqual([]);
	});

	it('lists at most five', () => {
		const many = Array.from({ length: 8 }, (_, i) => user(i + 10, `u${i}`));

		expect(mentionSuggestions(many, 'u')).toHaveLength(5);
	});
});
