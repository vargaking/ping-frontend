import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runHistorySync, type HistorySyncOptions } from '$lib/utils/historySync';
import { historyStatusLabel, historySyncState } from './historySyncState.svelte';
import { serversState } from './serversState.svelte';

vi.mock('$lib/utils/db', () => ({
	db: { messages: { count: vi.fn().mockResolvedValue(0) } },
	localHistoryAvailable: true
}));
vi.mock('$lib/utils/historySync', () => ({ runHistorySync: vi.fn() }));

const runMock = vi.mocked(runHistorySync);

function deferred() {
	let resolve!: () => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.useFakeTimers();
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	runMock.mockReset();
	runMock.mockResolvedValue(undefined);
	serversState.servers = { 1: { id: 1, name: 'one' }, 2: { id: 2, name: 'two' } };
	serversState.selectedServerId = 2;
});

afterEach(async () => {
	await historySyncState.stop();
	vi.useRealTimers();
	warn.mockRestore();
});

describe('historySyncState', () => {
	it('starts a requested run after a short delay, with the server order and signal', async () => {
		historySyncState.request();
		expect(runMock).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(3000);

		expect(runMock).toHaveBeenCalledTimes(1);
		const options = runMock.mock.calls[0][0] as HistorySyncOptions;
		expect(options.serverIds).toEqual([1, 2]);
		expect(options.preferServerId).toBe(2);
		expect(options.fullHistory).toBe(true);
		expect(options.signal.aborted).toBe(false);
	});

	it('shares one run between requests made while it waits', async () => {
		historySyncState.request();
		historySyncState.request();
		historySyncState.request();

		await vi.advanceTimersByTimeAsync(3000);

		expect(runMock).toHaveBeenCalledTimes(1);
	});

	it('runs once more after a run that was requested again meanwhile', async () => {
		const first = deferred();
		runMock.mockReturnValueOnce(first.promise);
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		expect(historySyncState.status).toBe('running');

		historySyncState.request();
		historySyncState.request();
		first.resolve();
		await vi.advanceTimersByTimeAsync(0);

		expect(runMock).toHaveBeenCalledTimes(2);
	});

	it('reports done when every thread is complete', async () => {
		runMock.mockImplementationOnce(async (options) => {
			options.onProgress?.({ threads: 3, complete: 3 });
		});
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);

		expect(historySyncState.status).toBe('done');
		expect(historyStatusLabel()).toBe('Message history: on this device, 0 messages');
	});

	it('goes back to idle while threads are incomplete', async () => {
		runMock.mockImplementationOnce(async (options) => {
			options.onProgress?.({ threads: 3, complete: 1 });
		});
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);

		expect(historySyncState.status).toBe('idle');
		expect(historyStatusLabel()).toBe('Message history: downloading, 1 of 3 conversations');
	});

	it('retries a failed run after 30 s, then 60 s', async () => {
		runMock.mockRejectedValue(new Error('offline'));
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		expect(runMock).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(29_000);
		expect(runMock).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(runMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(59_000);
		expect(runMock).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1000);
		expect(runMock).toHaveBeenCalledTimes(3);
	});

	it('aborts the run on stop, waits for it, and does not retry', async () => {
		const run = deferred();
		let signal!: AbortSignal;
		runMock.mockImplementationOnce(async (options) => {
			signal = options.signal;
			await run.promise;
		});
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		historySyncState.threads = 5;

		let stopped = false;
		const stopping = historySyncState.stop().then(() => (stopped = true));
		await vi.advanceTimersByTimeAsync(0);
		expect(signal.aborted).toBe(true);
		expect(stopped).toBe(false);

		run.reject(new Error('aborted'));
		await stopping;
		await vi.advanceTimersByTimeAsync(10 * 60_000);

		expect(runMock).toHaveBeenCalledTimes(1);
		expect(historySyncState.threads).toBe(0);
		expect(historySyncState.status).toBe('idle');
	});

	it('cancels a run that has not started yet on stop', async () => {
		historySyncState.request();
		await historySyncState.stop();
		await vi.advanceTimersByTimeAsync(10_000);

		expect(runMock).not.toHaveBeenCalled();
	});
});

describe('historyStatusLabel', () => {
	it('waits before anything was reported', () => {
		expect(historyStatusLabel()).toBe('Message history: waiting');
	});
});
