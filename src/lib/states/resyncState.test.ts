import { describe, expect, it, vi } from 'vitest';
import { ResyncState } from './resyncState.svelte';

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
