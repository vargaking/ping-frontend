import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { historyApi } from '$lib/requests/history';
import { db, localHistoryReady } from '$lib/utils/db';
import { resetLocalHistory } from '$lib/utils/messageChanges';
import {
	forgetSyncedChannels,
	runHistorySync,
	type HistorySyncOptions
} from '$lib/utils/historySync';
import { historyStatusLabel, historySyncState } from './historySyncState.svelte';
import type { Channel } from '$lib/types/channel.types';
import { serversState } from './serversState.svelte';
import { usersState } from './usersState.svelte';

vi.mock('$lib/utils/db', () => ({
	db: {
		messages: { count: vi.fn().mockResolvedValue(0) },
		threadSync: { toArray: vi.fn().mockResolvedValue([]) }
	},
	localHistoryAvailable: true,
	localHistoryReady: vi.fn()
}));
vi.mock('$lib/utils/historySync', () => ({
	runHistorySync: vi.fn(),
	forgetSyncedChannels: vi.fn()
}));

vi.mock('$lib/utils/messageChanges', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/utils/messageChanges')>()),
	resetLocalHistory: vi.fn()
}));

const runMock = vi.mocked(runHistorySync);
const resetMock = vi.mocked(resetLocalHistory);
const forgetMock = vi.mocked(forgetSyncedChannels);
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
	forgetMock.mockReset();
	forgetMock.mockResolvedValue(undefined);
	resetMock.mockReset();
	resetMock.mockResolvedValue(undefined);
	syncRowsMock.mockReset();
	syncRowsMock.mockResolvedValue([]);
	vi.stubGlobal('navigator', { locks: undefined });
	serversState.servers = { 1: { id: 1, name: 'one' }, 2: { id: 2, name: 'two' } };
	serversState.selectedServerId = 2;
	serversState.loaded = true;
	usersState.loggedInUser = null;
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

	it("lists a server's channels through the app's shared channel load", async () => {
		const channels = [{ id: 5, name: 'general' }] as Channel[];
		const load = vi.spyOn(serversState, 'loadServerChannels').mockResolvedValue(channels);
		let listed: Channel[] | undefined;
		runMock.mockImplementationOnce(async (options) => {
			listed = await options.api.channels(1, options.signal);
		});
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);

		expect(load).toHaveBeenCalledExactlyOnceWith(1);
		expect(listed).toBe(channels);
		load.mockRestore();
	});

	it('lets a failed channel load reach the sync engine', async () => {
		const failure = new Error('offline');
		const load = vi.spyOn(serversState, 'loadServerChannels').mockRejectedValue(failure);
		let caught: unknown;
		runMock.mockImplementationOnce(async (options) => {
			caught = await options.api.channels(1, options.signal).catch((e: unknown) => e);
		});
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);

		expect(caught).toBe(failure);
		load.mockRestore();
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

	it('says the download is off', async () => {
		stubLocalStorage();
		await historySyncState.setDownload(false);

		expect(historyStatusLabel()).toBe('Message history: download is off');
		await historySyncState.setDownload(true);
	});
});

describe('forgetChannels', () => {
	it('aborts a run in flight, waits for it, then deletes and starts a new run', async () => {
		const order: string[] = [];
		let signal!: AbortSignal;
		runMock.mockImplementationOnce(async (options) => {
			signal = options.signal;
			await new Promise<void>((resolve) =>
				options.signal.addEventListener('abort', () => resolve(), { once: true })
			);
			order.push('run ended');
		});
		forgetMock.mockImplementation(async () => {
			order.push('forgot');
		});
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		expect(historySyncState.status).toBe('running');

		await historySyncState.forgetChannels(1, [4, 5]);

		expect(signal.aborted).toBe(true);
		expect(order).toEqual(['run ended', 'forgot']);
		expect(forgetMock).toHaveBeenCalledExactlyOnceWith(1, [4, 5]);
		expect(runMock).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(3000);
		expect(runMock).toHaveBeenCalledTimes(2);
	});

	it('starts after the start delay even within the gap since the last run', async () => {
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		expect(runMock).toHaveBeenCalledTimes(1);

		await historySyncState.forgetChannels(1, null);
		await vi.advanceTimersByTimeAsync(2999);
		expect(runMock).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);

		expect(forgetMock).toHaveBeenCalledExactlyOnceWith(1, null);
		expect(runMock).toHaveBeenCalledTimes(2);
	});

	it('leaves the run to the layout while the server list has not loaded', async () => {
		serversState.loaded = false;

		await historySyncState.forgetChannels(1, [4]);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(forgetMock).toHaveBeenCalledExactlyOnceWith(1, [4]);
		expect(runMock).not.toHaveBeenCalled();
	});

	it('goes from done back to idle', async () => {
		runMock.mockImplementationOnce(async (options) => {
			options.onProgress?.({ threads: 1, complete: 1 });
		});
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		expect(historySyncState.status).toBe('done');

		await historySyncState.forgetChannels(1, [4]);

		expect(historySyncState.status).toBe('idle');
	});

	it('starts nothing when stopped while waiting for the run in flight', async () => {
		runMock.mockImplementationOnce(
			(options) =>
				new Promise<void>((resolve) =>
					options.signal.addEventListener('abort', () => resolve(), { once: true })
				)
		);
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);

		const forgetting = historySyncState.forgetChannels(1, [4]);
		await historySyncState.stop();
		await forgetting;
		await vi.advanceTimersByTimeAsync(10 * 60_000);

		expect(forgetMock).not.toHaveBeenCalled();
		expect(runMock).toHaveBeenCalledTimes(1);
		expect(historySyncState.status).toBe('idle');
	});

	it('starts nothing when stopped while deleting the sync rows', async () => {
		let finishForget!: () => void;
		forgetMock.mockImplementation(() => new Promise<void>((resolve) => (finishForget = resolve)));

		const forgetting = historySyncState.forgetChannels(1, [4]);
		await historySyncState.stop();
		finishForget();
		await forgetting;
		await vi.advanceTimersByTimeAsync(10 * 60_000);

		expect(runMock).not.toHaveBeenCalled();
	});

	it('still starts a run when deleting fails', async () => {
		forgetMock.mockRejectedValue(new Error('quota'));

		await historySyncState.forgetChannels(1, [4]);
		await vi.advanceTimersByTimeAsync(3000);

		expect(warn).toHaveBeenCalled();
		expect(runMock).toHaveBeenCalledTimes(1);
	});
});

describe('changes feed', () => {
	let storage: Map<string, string>;

	beforeEach(() => {
		storage = new Map([
			['historyChangesCursor:5', 'cursor-5'],
			['historyChangesCursor:6', 'cursor-6']
		]);
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => void storage.set(key, value),
			removeItem: (key: string) => void storage.delete(key)
		});
	});

	const signIn = (id: number) => (usersState.loggedInUser = { id } as never);

	it('runs for the signed-in user with the feed requests of the history api', async () => {
		signIn(5);
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);

		const options = runMock.mock.calls[0][0] as HistorySyncOptions;
		expect(options.userId).toBe(5);
		expect(options.api.messageChanges).toBe(historyApi.messageChanges);
		expect(options.api.messagesByIds).toBe(historyApi.messagesByIds);
	});

	it("removes the signed-out user's cursor on stop, even after the user is gone", async () => {
		signIn(5);
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		usersState.loggedInUser = null;

		await historySyncState.stop();

		expect([...storage.keys()]).toEqual(['historyChangesCursor:6']);
	});

	it('removes the cursor of a user whose run has not started yet', async () => {
		signIn(5);
		historySyncState.request();

		await historySyncState.stop();

		expect([...storage.keys()]).toEqual(['historyChangesCursor:6']);
	});

	it('keeps every cursor when no user was seen', async () => {
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);

		await historySyncState.stop();

		expect(storage.size).toBe(2);
	});
});

function stubLocalStorage(initial: [string, string][] = []) {
	const storage = new Map(initial);
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => void storage.set(key, value),
		removeItem: (key: string) => void storage.delete(key)
	});
	return storage;
}

const signedIn = (id = 5) => (usersState.loggedInUser = { id } as never);

describe('download switch', () => {
	let storage: Map<string, string>;

	beforeEach(() => {
		storage = stubLocalStorage();
		signedIn();
	});

	afterEach(() => historySyncState.setDownload(true));

	it('runs list-only and never walks for history while off', async () => {
		await historySyncState.setDownload(false);
		await vi.advanceTimersByTimeAsync(3000);

		expect(runMock).toHaveBeenCalledTimes(1);
		const options = runMock.mock.calls[0][0] as HistorySyncOptions;
		expect(options.listOnly).toBe(true);
		expect(options.fullHistory).toBe(false);
		expect(historySyncState.status).toBe('off');
		expect(storage.get('history:download')).toBe('off');
	});

	it('stays off while a list-only run is going and after it', async () => {
		const run = deferred();
		runMock.mockReturnValueOnce(run.promise);
		await historySyncState.setDownload(false);
		await vi.advanceTimersByTimeAsync(3000);
		expect(historySyncState.status).toBe('off');

		run.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(historySyncState.status).toBe('off');
	});

	it('aborts a run in flight when turned off, keeps what is stored and lists only after', async () => {
		let signal!: AbortSignal;
		runMock.mockImplementationOnce(
			(options) =>
				new Promise<void>((resolve) => {
					signal = options.signal;
					options.signal.addEventListener('abort', () => resolve(), { once: true });
				})
		);
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		expect(historySyncState.status).toBe('running');

		await historySyncState.setDownload(false);

		expect(signal.aborted).toBe(true);
		expect(resetMock).not.toHaveBeenCalled();
		expect(historySyncState.status).toBe('off');
		await vi.advanceTimersByTimeAsync(3000);
		expect(runMock).toHaveBeenCalledTimes(2);
		expect((runMock.mock.calls[1][0] as HistorySyncOptions).listOnly).toBe(true);
	});

	it('starts a full run 3 s after being turned on, however recently the last one began', async () => {
		await historySyncState.setDownload(false);
		await vi.advanceTimersByTimeAsync(3000);
		await vi.advanceTimersByTimeAsync(10 * SECOND);

		await historySyncState.setDownload(true);
		expect(historySyncState.status).toBe('idle');
		await vi.advanceTimersByTimeAsync(2999);
		expect(runMock).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);

		expect(runMock).toHaveBeenCalledTimes(2);
		const options = runMock.mock.calls[1][0] as HistorySyncOptions;
		expect(options.listOnly).toBe(false);
		expect(options.fullHistory).toBe(true);
	});

	it('starts nothing for a switch change before the server list has loaded', async () => {
		serversState.loaded = false;

		await historySyncState.setDownload(false);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(runMock).not.toHaveBeenCalled();
	});
});

const storageEvent = (key: string) => Object.assign(new Event('storage'), { key });

async function freshTab(storage: Map<string, string>, connection?: { saveData: boolean }) {
	vi.resetModules();
	const tabs = new EventTarget();
	vi.stubGlobal('window', tabs);
	vi.stubGlobal('navigator', { locks: undefined, connection });
	const { localHistoryReady: ready } = await import('$lib/utils/db');
	vi.mocked(ready).mockResolvedValue(true);
	const { serversState: servers } = await import('./serversState.svelte');
	const { usersState: users } = await import('./usersState.svelte');
	servers.servers = { 1: { id: 1, name: 'one' } } as never;
	servers.loaded = true;
	users.loggedInUser = { id: 5 } as never;
	const { historySyncState: fresh } = await import('./historySyncState.svelte');
	const { runHistorySync: run } = await import('$lib/utils/historySync');
	const { resetLocalHistory: reset } = await import('$lib/utils/messageChanges');
	return {
		state: fresh,
		run: vi.mocked(run),
		reset: vi.mocked(reset),
		change(key: string, value: string) {
			storage.set(key, value);
			tabs.dispatchEvent(storageEvent(key));
		}
	};
}

describe('another tab changes the switch or clears', () => {
	let storage: Map<string, string>;

	beforeEach(() => {
		storage = stubLocalStorage();
	});

	it('follows the switch', async () => {
		const tab = await freshTab(storage);
		expect(tab.state.status).toBe('idle');

		tab.change('history:download', 'off');
		await vi.advanceTimersByTimeAsync(0);
		expect(tab.state.downloadOn).toBe(false);
		expect(tab.state.status).toBe('off');

		tab.change('history:download', 'on');
		await vi.advanceTimersByTimeAsync(3000);
		expect(tab.state.downloadOn).toBe(true);
		expect(tab.run).toHaveBeenCalledTimes(1);
		expect((tab.run.mock.calls[0][0] as HistorySyncOptions).listOnly).toBe(false);
		await tab.state.stop();
	});

	it('starts off when the switch was already off', async () => {
		storage.set('history:download', 'off');
		const tab = await freshTab(storage);

		expect(tab.state.status).toBe('off');
		expect(tab.state.downloadOn).toBe(false);
	});

	it('stops writing when a clear starts, and starts over once it is done', async () => {
		const tab = await freshTab(storage);
		let signal!: AbortSignal;
		tab.run.mockImplementationOnce(
			(options) =>
				new Promise<void>((resolve) => {
					signal = options.signal;
					options.signal.addEventListener('abort', () => resolve(), { once: true });
				})
		);
		tab.state.request();
		await vi.advanceTimersByTimeAsync(3000);
		tab.state.threads = 4;

		tab.change('history:cleared', '1');
		await vi.advanceTimersByTimeAsync(0);

		expect(signal.aborted).toBe(true);
		expect(tab.state.threads).toBe(0);
		expect(tab.reset).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(3000);
		expect(tab.run).toHaveBeenCalledTimes(2);
		await tab.state.stop();
	});
});

describe('browser data saver', () => {
	let storage: Map<string, string>;

	beforeEach(() => {
		storage = stubLocalStorage();
	});

	it('limits the download to the newest messages when nothing was chosen', async () => {
		const tab = await freshTab(storage, { saveData: true });
		tab.state.request();
		await vi.advanceTimersByTimeAsync(3000);

		expect((tab.run.mock.calls[0][0] as HistorySyncOptions).fullHistory).toBe(false);
		expect(tab.state.savingData).toBe(true);
		await tab.state.stop();
	});

	it('gives way to an explicit choice to download everything', async () => {
		const tab = await freshTab(storage, { saveData: true });
		await tab.state.setDownload(true);
		await vi.advanceTimersByTimeAsync(3000);

		expect((tab.run.mock.calls[0][0] as HistorySyncOptions).fullHistory).toBe(true);
		expect(tab.state.savingData).toBe(false);
		await tab.state.stop();
	});
});

describe('clear', () => {
	let storage: Map<string, string>;

	beforeEach(() => {
		storage = stubLocalStorage([['historyChangesCursor:5', 'cursor-5']]);
		signedIn();
	});

	afterEach(() => historySyncState.setDownload(true));

	it('aborts the run and waits for it, then wipes, drops the cursor and downloads again', async () => {
		const order: string[] = [];
		runMock.mockImplementationOnce(async (options) => {
			await new Promise<void>((resolve) =>
				options.signal.addEventListener('abort', () => resolve(), { once: true })
			);
			order.push('run ended');
		});
		resetMock.mockImplementation(async () => {
			order.push('wiped');
			expect(storage.has('historyChangesCursor:5')).toBe(true);
		});
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(3000);
		historySyncState.threads = 6;
		historySyncState.complete = 2;

		await historySyncState.clear();

		expect(order).toEqual(['run ended', 'wiped']);
		expect(storage.has('historyChangesCursor:5')).toBe(false);
		expect(storage.has('history:cleared')).toBe(true);
		expect(historySyncState.threads).toBe(0);
		expect(historySyncState.status).toBe('idle');
		expect(runMock).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(3000);
		expect(runMock).toHaveBeenCalledTimes(2);
	});

	it('wipes only once other tabs have let go of the sync lock', async () => {
		const order: string[] = [];
		const request = vi.fn(async (_name: string, callback: (lock: object) => Promise<void>) => {
			order.push('lock taken');
			await callback({});
			order.push('lock released');
		});
		vi.stubGlobal('navigator', { locks: { request } });
		resetMock.mockImplementation(async () => void order.push('wiped'));

		await historySyncState.clear();

		expect(order).toEqual(['lock taken', 'wiped', 'lock released']);
	});

	it('starts no download while the switch is off', async () => {
		await historySyncState.setDownload(false);
		await vi.advanceTimersByTimeAsync(3000);
		runMock.mockClear();

		await historySyncState.clear();
		await vi.advanceTimersByTimeAsync(10 * 60_000);

		expect(resetMock).toHaveBeenCalledTimes(1);
		expect(runMock).not.toHaveBeenCalled();
		expect(historySyncState.status).toBe('off');
	});

	it('keeps the cursor and still resumes when wiping fails', async () => {
		resetMock.mockRejectedValue(new Error('quota'));

		await expect(historySyncState.clear()).rejects.toThrow('quota');
		await vi.advanceTimersByTimeAsync(3000);

		expect(storage.has('historyChangesCursor:5')).toBe(true);
		expect(runMock).toHaveBeenCalledTimes(1);
	});

	it('starts no run while the wipe is under way', async () => {
		let finishReset!: () => void;
		resetMock.mockImplementation(() => new Promise<void>((resolve) => (finishReset = resolve)));

		const clearing = historySyncState.clear();
		await vi.advanceTimersByTimeAsync(0);
		historySyncState.request();
		await vi.advanceTimersByTimeAsync(10 * 60_000);
		expect(runMock).not.toHaveBeenCalled();

		finishReset();
		await clearing;
		await vi.advanceTimersByTimeAsync(3000);
		expect(runMock).toHaveBeenCalledTimes(1);
	});

	it('starts nothing when stopped meanwhile', async () => {
		let finishReset!: () => void;
		resetMock.mockImplementation(() => new Promise<void>((resolve) => (finishReset = resolve)));

		const clearing = historySyncState.clear();
		await vi.advanceTimersByTimeAsync(0);
		await historySyncState.stop();
		finishReset();
		await clearing;
		await vi.advanceTimersByTimeAsync(10 * 60_000);

		expect(runMock).not.toHaveBeenCalled();
	});
});
