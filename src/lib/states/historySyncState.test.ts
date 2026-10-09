import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, localHistoryReady } from '$lib/utils/db';
import { runHistorySync, type HistorySyncOptions } from '$lib/utils/historySync';
import { historyStatusLabel, historySyncState } from './historySyncState.svelte';
import { serversState } from './serversState.svelte';

vi.mock('$lib/utils/db', () => ({
	db: {
		messages: { count: vi.fn().mockResolvedValue(0) },
		threadSync: { toArray: vi.fn().mockResolvedValue([]) }
	},
	localHistoryAvailable: true,
	localHistoryReady: vi.fn()
}));
vi.mock('$lib/utils/historySync', () => ({ runHistorySync: vi.fn() }));

const runMock = vi.mocked(runHistorySync);
const readyMock = vi.mocked(localHistoryReady);
const syncRowsMock = vi.mocked(db.threadSync.toArray);

const SECOND = 1000;

type LockCallback = (lock: object | null) => Promise<boolean>;

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
	readyMock.mockReset();
	readyMock.mockResolvedValue(true);
	syncRowsMock.mockReset();
	syncRowsMock.mockResolvedValue([]);
	vi.stubGlobal('navigator', { locks: undefined });
	serversState.servers = { 1: { id: 1, name: 'one' }, 2: { id: 2, name: 'two' } };
	serversState.selectedServerId = 2;
});

afterEach(async () => {
	await historySyncState.stop();
	vi.useRealTimers();
	vi.unstubAllGlobals();
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
		expect(runMock).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(60 * SECOND);
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

describe('storage that cannot be opened', () => {
	it('makes no request, schedules no retry and ignores later requests', async () => {
		vi.resetModules();
		const dbModule = await import('$lib/utils/db');
		const historySync = await import('$lib/utils/historySync');
		const { historySyncState: fresh } = await import('./historySyncState.svelte');
		vi.mocked(dbModule.localHistoryReady).mockResolvedValue(false);

		fresh.request();
		await vi.advanceTimersByTimeAsync(3000);
		expect(fresh.status).toBe('unavailable');

		fresh.request();
		await vi.advanceTimersByTimeAsync(10 * 60 * SECOND);
		expect(historySync.runHistorySync).not.toHaveBeenCalled();
		expect(dbModule.localHistoryReady).toHaveBeenCalledTimes(1);
		expect(fresh.status).toBe('unavailable');
	});
});

describe('another tab holds the lock', () => {
	function lockHeldElsewhere() {
		const request = vi.fn(async (_name: string, _options: unknown, callback: LockCallback) =>
			callback(null)
		);
		vi.stubGlobal('navigator', { locks: { request } });
		return request;
	}

	it('shows that tab progress from the stored rows and stays idle', async () => {
		lockHeldElsewhere();
		syncRowsMock.mockResolvedValue([
			{ complete: true },
			{ complete: false },
			{ complete: true }
		] as never);
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);

		expect(runMock).not.toHaveBeenCalled();
		expect(historySyncState.status).toBe('idle');
		expect(historySyncState.threads).toBe(3);
		expect(historySyncState.complete).toBe(2);
	});

	it('checks again every 60 s and takes over once the lock is free', async () => {
		const request = lockHeldElsewhere();
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		expect(request).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(59 * SECOND);
		expect(request).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1 * SECOND);
		expect(request).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(60 * SECOND);
		expect(request).toHaveBeenCalledTimes(3);
		expect(runMock).not.toHaveBeenCalled();

		request.mockImplementation(async (_name, _options, callback) => callback({}));
		await vi.advanceTimersByTimeAsync(60 * SECOND);
		expect(runMock).toHaveBeenCalledTimes(1);
	});
});

describe('run rate', () => {
	it('starts a requested run no sooner than 60 s after the previous one started', async () => {
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		expect(runMock).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(10 * SECOND);
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(49 * SECOND);
		expect(runMock).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1 * SECOND);
		expect(runMock).toHaveBeenCalledTimes(2);
	});

	it('keeps the short delay once the gap has passed', async () => {
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		await vi.advanceTimersByTimeAsync(2 * 60 * SECOND);

		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		expect(runMock).toHaveBeenCalledTimes(2);
	});

	it('waits out the gap for a run queued behind a running one', async () => {
		const first = deferred();
		runMock.mockReturnValueOnce(first.promise);
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(20 * SECOND);
		first.resolve();
		await vi.advanceTimersByTimeAsync(39 * SECOND);
		expect(runMock).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1 * SECOND);
		expect(runMock).toHaveBeenCalledTimes(2);
	});

	it('does not delay failure retries', async () => {
		runMock.mockRejectedValue(new Error('offline'));
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		await vi.advanceTimersByTimeAsync(30 * SECOND);
		expect(runMock).toHaveBeenCalledTimes(2);
	});
});

describe('historyStatusLabel', () => {
	it('waits before anything was reported', () => {
		expect(historyStatusLabel()).toBe('Message history: waiting');
	});
});
