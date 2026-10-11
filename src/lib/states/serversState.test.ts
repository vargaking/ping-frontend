import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSnapshot = vi.hoisted(() => vi.fn());
vi.mock('$lib/requests/channels/getServerChannelSnapshot', () => ({
	getServerChannelSnapshot: getSnapshot
}));

const getMembers = vi.hoisted(() => vi.fn());
const getRoles = vi.hoisted(() => vi.fn());
const getViewers = vi.hoisted(() => vi.fn());
vi.mock('$lib/requests/servers/getServerMembers', () => ({ getServerMembers: getMembers }));
vi.mock('$lib/requests/servers/getServerRoles', () => ({ getServerRoles: getRoles }));
vi.mock('$lib/requests/channels/permissionOverwrites', () => ({ getChannelViewers: getViewers }));

import { ServersState } from './serversState.svelte';
import { unreadState } from './unreadState.svelte';
import { usersState } from './usersState.svelte';
import type { Channel, ChannelGroup } from '$lib/types/channel.types';
import type { User } from '$lib/types/auth.types';
import type { ServerMember } from '$lib/types/server.types';

const snapshot = { groups: [], channels: [{ id: 1, name: 'general', type: 'text', position: 0 }] };

beforeEach(() => {
	getSnapshot.mockReset();
	getSnapshot.mockResolvedValue(snapshot);
	getMembers.mockReset();
	getRoles.mockReset();
	getRoles.mockResolvedValue([]);
	getViewers.mockReset();
	usersState.reset();
});

describe('loadServerChannels', () => {
	it('shares a load that is still running', async () => {
		const state = new ServersState();
		const first = state.loadServerChannels(7);
		const second = state.loadServerChannels(7);
		expect(second).toBe(first);
		await first;
		expect(getSnapshot).toHaveBeenCalledTimes(1);
	});

	it('reuses channels loaded a moment ago and refetches when asked to', async () => {
		const state = new ServersState();
		await state.loadServerChannels(7);
		await state.loadServerChannels(7);
		expect(getSnapshot).toHaveBeenCalledTimes(1);

		await state.loadServerChannels(7, 0);
		expect(getSnapshot).toHaveBeenCalledTimes(2);
	});

	it('refetches once the loaded channels are older than the window', async () => {
		vi.useFakeTimers();
		try {
			const state = new ServersState();
			await state.loadServerChannels(7);
			vi.advanceTimersByTime(31_000);
			await state.loadServerChannels(7);
			expect(getSnapshot).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('tries again after a failed load', async () => {
		const state = new ServersState();
		getSnapshot.mockRejectedValueOnce(new Error('offline'));
		await expect(state.loadServerChannels(7)).rejects.toThrow('offline');
		await state.loadServerChannels(7);
		expect(getSnapshot).toHaveBeenCalledTimes(2);
	});
});

describe('updateChannel', () => {
	const channel = (extra: Partial<Channel> = {}): Channel => ({
		id: 1,
		name: 'general',
		type: 'text',
		topic: null,
		group_id: 3,
		position: 2,
		channel_settings: { slowmode: 5 },
		private: false,
		...extra
	});

	function loaded() {
		const state = new ServersState();
		state.channels = { 7: { 1: channel() } };
		return state;
	}

	it('keeps the stored channel when nothing changed', () => {
		const state = loaded();
		const before = state.channels[7][1];
		state.updateChannel(7, channel({ channel_settings: { slowmode: 5 } }));
		expect(state.channels[7][1]).toBe(before);
	});

	it('keeps the unread entry when the name is the same', () => {
		unreadState.noteNewChannel(7, channel());
		const before = unreadState['channels'][1];
		loaded().updateChannel(7, channel());
		expect(unreadState['channels'][1]).toBe(before);
		unreadState.reset();
	});

	it('replaces the stored channel when the private flag flips', () => {
		const state = loaded();
		const before = state.channels[7][1];
		state.updateChannel(7, channel({ private: true }));
		expect(state.channels[7][1]).not.toBe(before);
		expect(state.channels[7][1].private).toBe(true);
	});

	it('replaces the stored channel when its settings change', () => {
		const state = loaded();
		state.updateChannel(7, channel({ channel_settings: { slowmode: 10 } }));
		expect(state.channels[7][1].channel_settings).toEqual({ slowmode: 10 });
	});
});

describe('updateGroup', () => {
	const group: ChannelGroup = { id: 3, server_id: 7, name: 'Staff', position: 1, private: false };

	it('keeps the stored group when nothing changed', () => {
		const state = new ServersState();
		state.channelGroups = { 7: { 3: { ...group } } };
		const before = state.channelGroups[7][3];
		state.updateGroup(7, { ...group });
		expect(state.channelGroups[7][3]).toBe(before);
	});

	it('replaces the stored group when something changed', () => {
		const state = new ServersState();
		state.channelGroups = { 7: { 3: { ...group } } };
		state.updateGroup(7, { ...group, private: true });
		expect(state.channelGroups[7][3].private).toBe(true);
	});
});

describe('loadRoster', () => {
	const user = (id: number, username: string): User => ({
		id,
		username,
		public_key: '',
		profile: {}
	});
	const member = (u: User, role_ids: number[] = []): ServerMember => ({
		user: u,
		joined_at: '2026-01-01T00:00:00Z',
		is_owner: false,
		role_ids
	});

	function withServer(members: User[]) {
		const state = new ServersState();
		state.servers = { 7: { id: 7, name: 'ping', members } };
		return state;
	}

	it.each([
		['a member joined', [user(1, 'ann')], [user(1, 'ann'), user(2, 'bo')]],
		['a member left', [user(1, 'ann'), user(2, 'bo')], [user(1, 'ann')]]
	])('replaces the member list with the roster when %s', async (_name, before, after) => {
		const state = withServer(before);
		getMembers.mockResolvedValue(after.map((u) => member(u)));

		await state.loadRoster(7);

		expect(state.servers[7].members).toEqual(after);
	});

	it('refreshes the profiles of the members it fetched', async () => {
		const state = withServer([user(1, 'ann')]);
		usersState.users[1] = user(1, 'ann');
		getMembers.mockResolvedValue([member(user(1, 'anna'))]);

		await state.loadRoster(7);

		expect(usersState.users[1].username).toBe('anna');
	});

	it('keeps role assignments for the sidebar', async () => {
		const state = withServer([]);
		getMembers.mockResolvedValue([member(user(1, 'ann'), [4, 5])]);

		await state.loadRoster(7);

		expect(state.memberRoles[7]).toEqual({ 1: [4, 5] });
	});

	it('remembers when members joined until they leave or the server goes', async () => {
		const state = withServer([]);
		getMembers.mockResolvedValue([member(user(1, 'ann')), member(user(2, 'bo'))]);

		await state.loadRoster(7);
		expect(state.joinedAtOf(7, 1)).toBe('2026-01-01T00:00:00Z');
		expect(state.joinedAtOf(7, 3)).toBeNull();

		state.removeMember(7, 1);
		expect(state.joinedAtOf(7, 1)).toBeNull();
		expect(state.joinedAtOf(7, 2)).toBe('2026-01-01T00:00:00Z');

		state.removeServer(7);
		expect(state.joinedAtOf(7, 2)).toBeNull();
	});

	it.each([
		['joins', [1], (state: ServersState) => state.addMember(7, user(2, 'bo')), [1], [1, 2]],
		['leaves', [1, 2], (state: ServersState) => state.removeMember(7, 2), [1, 2], [1]]
	])(
		'keeps the change when a member %s while the roster loads',
		async (_name, before, event, fetched, expected) => {
			const state = withServer(before.map((id) => user(id, `u${id}`)));
			getMembers.mockImplementation(async () => {
				const response = fetched.map((id) => member(user(id, `u${id}`)));
				event(state);
				return response;
			});

			await state.loadRoster(7);

			expect(state.servers[7].members?.map((m) => m.id)).toEqual(expected);
		}
	);

	it('ignores a roster that arrives after a newer one', async () => {
		const state = withServer([]);
		const pending: ((members: ServerMember[]) => void)[] = [];
		getMembers.mockImplementation(
			() => new Promise<ServerMember[]>((resolve) => pending.push(resolve))
		);

		const older = state.loadRoster(7);
		const newer = state.loadRoster(7);
		pending[1]([member(user(1, 'ann'), [4]), member(user(2, 'bo'))]);
		await newer;
		pending[0]([member(user(1, 'ann'), [5])]);
		await older;

		expect(state.servers[7].members?.map((m) => m.id)).toEqual([1, 2]);
		expect(state.memberRoles[7]).toEqual({ 1: [4], 2: [] });
	});

	it('does not bring back a server that was removed while loading', async () => {
		const state = withServer([]);
		getMembers.mockImplementation(async () => {
			delete state.servers[7];
			return [member(user(1, 'ann'))];
		});

		await state.loadRoster(7);

		expect(state.servers[7]).toBeUndefined();
	});
});

describe('loadChannelViewers', () => {
	it('shares a load that is still running', async () => {
		const state = new ServersState();
		getViewers.mockResolvedValue([1, 2]);

		await Promise.all([state.loadChannelViewers(3), state.loadChannelViewers(3)]);

		expect(getViewers).toHaveBeenCalledTimes(1);
		expect(state.channelViewers[3]).toEqual([1, 2]);
	});

	it.each([
		['within the window', 5_000, 1],
		['past the window', 15_000, 2]
	])('loads again only when asked %s', async (_name, elapsedMs, calls) => {
		vi.useFakeTimers();
		try {
			const state = new ServersState();
			getViewers.mockResolvedValue([1]);
			await state.loadChannelViewers(3, 10_000);
			vi.advanceTimersByTime(elapsedMs);
			await state.loadChannelViewers(3, 10_000);
			expect(getViewers).toHaveBeenCalledTimes(calls);
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps the previous viewers when a load fails', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const state = new ServersState();
		state.channelViewers = { 3: [1] };
		getViewers.mockRejectedValue(new Error('offline'));

		await state.loadChannelViewers(3);

		expect(state.channelViewers[3]).toEqual([1]);
	});
});
