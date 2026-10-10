import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSnapshot = vi.hoisted(() => vi.fn());
vi.mock('$lib/requests/channels/getServerChannelSnapshot', () => ({
	getServerChannelSnapshot: getSnapshot
}));

import { ServersState } from './serversState.svelte';
import { unreadState } from './unreadState.svelte';
import type { Channel, ChannelGroup } from '$lib/types/channel.types';

const snapshot = { groups: [], channels: [{ id: 1, name: 'general', type: 'text', position: 0 }] };

beforeEach(() => {
	getSnapshot.mockReset();
	getSnapshot.mockResolvedValue(snapshot);
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
