import { describe, expect, it, vi } from 'vitest';

const servers = vi.hoisted(() => ({
	servers: { 3: {}, 8: {} } as Record<number, object>,
	loadServerChannels: vi.fn(),
	loadRoster: vi.fn()
}));
vi.mock('./serversState.svelte', () => ({ serversState: servers }));
vi.mock('./conversationsState.svelte', () => ({ conversationsState: { fetch: vi.fn() } }));
vi.mock('$lib/utils/notificationSweep', () => ({ closeReadNotifications: vi.fn() }));

import { ResyncState, refreshLists } from './resyncState.svelte';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
}

describe('ResyncState', () => {
	it('refreshes the lists, then bumps the generation', async () => {
		const order: string[] = [];
		const state = new ResyncState(async () => {
			order.push(`refresh at ${state.generation}`);
		});

		await state.request('reconnect');

		expect(order).toEqual(['refresh at 0']);
		expect(state.generation).toBe(1);
	});

	it('queues a single follow-up for any number of requests during a run', async () => {
		const runs: ReturnType<typeof deferred>[] = [];
		const refresh = vi.fn(() => {
			const run = deferred();
			runs.push(run);
			return run.promise;
		});
		const state = new ResyncState(refresh);

		const first = state.request('resume');
		void state.request('reconnect');
		void state.request('notification');
		expect(refresh).toHaveBeenCalledTimes(1);

		runs[0].resolve();
		await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
		runs[1].resolve();
		await first;

		expect(refresh).toHaveBeenCalledTimes(2);
		expect(state.generation).toBe(2);
	});

	it('still bumps the generation when refreshing the lists fails', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const state = new ResyncState(() => Promise.reject(new Error('offline')));

		await state.request('reconnect');

		expect(state.generation).toBe(1);
	});
});

describe('refreshLists', () => {
	it('reloads the channels and the member roster of every loaded server', async () => {
		servers.loadServerChannels.mockReset().mockResolvedValue([]);
		servers.loadRoster.mockReset().mockResolvedValue([]);

		await refreshLists();

		expect(servers.loadServerChannels.mock.calls).toEqual([
			[3, 0],
			[8, 0]
		]);
		expect(servers.loadRoster.mock.calls).toEqual([[3], [8]]);
	});

	it('still refreshes the other servers when one roster fails', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		servers.loadServerChannels.mockReset().mockResolvedValue([]);
		servers.loadRoster.mockReset().mockImplementation(async (id: number) => {
			if (id === 3) throw new Error('offline');
			return [];
		});

		await expect(refreshLists()).resolves.toBeUndefined();

		expect(servers.loadRoster).toHaveBeenCalledTimes(2);
		expect(servers.loadServerChannels).toHaveBeenCalledTimes(2);
	});
});
