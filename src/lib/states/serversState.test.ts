import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSnapshot = vi.hoisted(() => vi.fn());
vi.mock('$lib/requests/channels/getServerChannelSnapshot', () => ({
	getServerChannelSnapshot: getSnapshot
}));

import { ServersState } from './serversState.svelte';

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
