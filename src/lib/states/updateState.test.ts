import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controllerChanges, FakeRegistration, FakeWorker } from '../../test/fakeServiceWorker';
import {
	ACTIVATE_TIMEOUT_MS,
	CHECK_MIN_GAP_MS,
	PREPARE_RETRY_MS,
	RELOAD_STUCK_MS,
	UpdateState,
	type UpdateDeps
} from './updateState.svelte';
import { ComposerDraftState } from './composerDraftState.svelte';

vi.mock('$app/state', () => ({ updated: { current: false, check: vi.fn() } }));
vi.mock('$app/environment', () => ({ version: 'page-v' }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

function setup(
	options: {
		registration?: FakeRegistration | null;
		serverIsNewer?: boolean;
		controlled?: boolean;
	} = {}
) {
	const registration =
		options.registration === undefined ? new FakeRegistration() : options.registration;
	const changes = controllerChanges();
	const calls: string[] = [];
	const workerVersions = new Map<FakeWorker, string>();
	let onUpdated: () => void = () => {};
	let clock = 1_000_000;
	let online = true;
	const pageHideListeners = new Set<() => void>();

	const deps = {
		pageVersion: 'page-v',
		checkVersion: vi.fn(async () => options.serverIsNewer ?? false),
		watchUpdated: vi.fn((callback: () => void) => (onUpdated = callback)),
		getRegistration: vi.fn(async () => registration),
		hasController: vi.fn(() => options.controlled ?? true),
		onControllerChange: changes.subscribe,
		askVersion: vi.fn(async (worker: FakeWorker) => workerVersions.get(worker) ?? null),
		online: vi.fn(() => online),
		onPageHide: vi.fn((listener: () => void) => {
			pageHideListeners.add(listener);
			return () => void pageHideListeners.delete(listener);
		}),
		saveDraft: vi.fn(() => void calls.push('saveDraft')),
		reload: vi.fn(() => void calls.push('reload')),
		now: vi.fn(() => clock)
	};
	const state = new UpdateState(deps as unknown as UpdateDeps);

	return {
		state,
		deps,
		registration,
		changes,
		calls,
		workerVersions,
		found: () => onUpdated(),
		armedPageHideListeners: () => pageHideListeners.size,
		firePageHide: () => {
			for (const listener of [...pageHideListeners]) {
				pageHideListeners.delete(listener);
				listener();
			}
		},
		advanceClock: (ms: number) => (clock += ms),
		goOffline: () => (online = false),
		goOnline: () => (online = true)
	};
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('UpdateState checking', () => {
	it('skips a check within the minimum gap of the last one', async () => {
		const { state, deps, advanceClock } = setup();

		await state.check();
		advanceClock(CHECK_MIN_GAP_MS - 1);
		await state.check();
		expect(deps.checkVersion).toHaveBeenCalledTimes(1);

		advanceClock(1);
		await state.check();
		expect(deps.checkVersion).toHaveBeenCalledTimes(2);
	});

	it('shares one check in flight', async () => {
		const { state, deps } = setup();
		const answer = deferred<boolean>();
		deps.checkVersion.mockReturnValue(answer.promise);

		const first = state.check();
		const second = state.check();
		answer.resolve(false);
		await Promise.all([first, second]);

		expect(deps.checkVersion).toHaveBeenCalledTimes(1);
	});

	it('does nothing once a version is known', async () => {
		const { state, deps, advanceClock } = setup({ registration: null, serverIsNewer: true });

		await state.check();
		await flush();
		advanceClock(10 * CHECK_MIN_GAP_MS);
		await state.check();

		expect(deps.checkVersion).toHaveBeenCalledTimes(1);
	});

	it('treats a failing check as nothing found', async () => {
		const { state, deps, advanceClock } = setup();
		deps.checkVersion.mockRejectedValueOnce(new Error('offline'));

		await state.check();
		expect(state.phase).toBe('idle');

		advanceClock(CHECK_MIN_GAP_MS);
		deps.checkVersion.mockResolvedValue(false);
		await state.check();
		expect(deps.checkVersion).toHaveBeenCalledTimes(2);
	});
});

describe('UpdateState finding a version', () => {
	it('installs the new worker before the notice shows', async () => {
		const { state, registration } = setup({ serverIsNewer: true });
		const worker = new FakeWorker();
		registration!.update.mockImplementation(async () => {
			registration!.installing = worker;
		});

		await state.check();
		await flush();
		expect(registration!.update).toHaveBeenCalledTimes(1);
		expect(state.phase).toBe('preparing');
		expect(state.available).toBe(false);

		registration!.installing = null;
		registration!.waiting = worker;
		worker.setState('installed');
		await flush();

		expect(state.phase).toBe('ready');
		expect(state.noticeVisible).toBe(true);
	});

	it('does the same when the background poll finds a version', async () => {
		const { state, registration, found } = setup();
		registration!.update.mockImplementation(async () => {
			registration!.waiting = new FakeWorker();
		});
		state.start();

		found();
		await flush();

		expect(registration!.update).toHaveBeenCalledTimes(1);
		expect(state.phase).toBe('ready');
	});

	it('shows the notice at once without a service worker', async () => {
		const { state } = setup({ registration: null, serverIsNewer: true });

		await state.check();
		await flush();

		expect(state.phase).toBe('ready');
	});

	it('retries after 15 s, 60 s and 180 s, then shows the notice anyway', async () => {
		const { state, registration } = setup({ serverIsNewer: true });
		expect(PREPARE_RETRY_MS).toEqual([15_000, 60_000, 180_000]);

		await state.check();
		await flush();
		expect(registration!.update).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(14_999);
		expect(registration!.update).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(registration!.update).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(registration!.update).toHaveBeenCalledTimes(3);
		expect(state.phase).toBe('preparing');

		await vi.advanceTimersByTimeAsync(180_000);
		expect(registration!.update).toHaveBeenCalledTimes(4);
		expect(state.phase).toBe('ready');
	});

	it('counts a failing update as nothing found and tries again', async () => {
		const { state, registration } = setup({ serverIsNewer: true });
		registration!.update.mockRejectedValueOnce(new Error('offline'));

		await state.check();
		await flush();
		expect(state.phase).toBe('preparing');

		registration!.update.mockImplementation(async () => {
			registration!.waiting = new FakeWorker();
		});
		await vi.advanceTimersByTimeAsync(15_000);

		expect(state.phase).toBe('ready');
	});

	it('shows the notice at once in a page no worker controls, without waiting for an install', async () => {
		const { state, registration } = setup({ serverIsNewer: true, controlled: false });

		await state.check();
		await flush();

		expect(state.phase).toBe('ready');
		expect(registration!.update).not.toHaveBeenCalled();
	});

	it('keeps the update available after the notice is dismissed', async () => {
		const { state } = setup({ registration: null, serverIsNewer: true });
		await state.check();
		await flush();

		state.dismiss();

		expect(state.noticeVisible).toBe(false);
		expect(state.available).toBe(true);
	});
});

describe('UpdateState reload', () => {
	async function readyWithWaitingWorker() {
		const setupResult = setup({ serverIsNewer: true });
		const { registration, state } = setupResult;
		const worker = new FakeWorker();
		worker.state = 'installed';
		registration!.update.mockImplementation(async () => {
			registration!.waiting = worker;
		});
		state.start();
		await state.check();
		await flush();
		expect(state.phase).toBe('ready');
		return { ...setupResult, worker };
	}

	it('activates the waiting worker, then reloads once', async () => {
		const { state, worker, changes, calls, deps } = await readyWithWaitingWorker();

		const done = state.reload();
		await flush();
		expect(worker.postMessage).toHaveBeenCalledWith({ type: 'skip-waiting' });
		expect(deps.reload).not.toHaveBeenCalled();

		changes.fire();
		worker.setState('activated');
		await done;

		expect(calls).toEqual(['reload']);
		expect(state.phase).toBe('reloading');
	});

	it('reloads an uncontrolled page when the worker reports activated', async () => {
		const { state, worker, deps } = await readyWithWaitingWorker();

		const done = state.reload();
		await flush();
		worker.setState('activated');
		await done;

		expect(deps.reload).toHaveBeenCalledTimes(1);
	});

	it('reloads after 10 s when the worker never activates', async () => {
		const { state, deps } = await readyWithWaitingWorker();

		void state.reload();
		await vi.advanceTimersByTimeAsync(ACTIVATE_TIMEOUT_MS - 1);
		expect(deps.reload).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(deps.reload).toHaveBeenCalledTimes(1);
	});

	it('reloads at once when nothing is waiting', async () => {
		const { state, deps, calls } = setup({ registration: null, serverIsNewer: true });
		await state.check();
		await flush();

		await state.reload();

		expect(calls).toEqual(['reload']);
		expect(deps.reload).toHaveBeenCalledTimes(1);
	});

	it('does not reload while offline, and proceeds once online', async () => {
		const { state, deps, goOffline, goOnline } = setup({ registration: null, serverIsNewer: true });
		await state.check();
		await flush();

		goOffline();
		await state.reload();
		expect(deps.reload).not.toHaveBeenCalled();
		expect(state.offline).toBe(true);
		expect(state.phase).toBe('ready');

		goOnline();
		await state.reload();
		expect(deps.reload).toHaveBeenCalledTimes(1);
		expect(state.offline).toBe(false);
	});

	it('ignores a second click while reloading', async () => {
		const { state, worker, deps } = await readyWithWaitingWorker();

		const first = state.reload();
		const second = state.reload();
		await flush();
		worker.setState('activated');
		await Promise.all([first, second]);

		expect(worker.postMessage).toHaveBeenCalledTimes(1);
		expect(deps.reload).toHaveBeenCalledTimes(1);
	});

	it('returns to ready if the page is still alive 10 s after reloading', async () => {
		const { state } = setup({ registration: null, serverIsNewer: true });
		await state.check();
		await flush();

		await state.reload();
		expect(state.phase).toBe('reloading');

		await vi.advanceTimersByTimeAsync(RELOAD_STUCK_MS);
		expect(state.phase).toBe('ready');
	});
});

describe('UpdateState reload draft', () => {
	function memoryStorage() {
		const data = new Map<string, string>();
		return {
			getItem: (key: string) => data.get(key) ?? null,
			setItem: (key: string, value: string) => void data.set(key, value),
			removeItem: (key: string) => void data.delete(key)
		};
	}

	async function readyWithOpenComposer() {
		const setupResult = setup({ registration: null, serverIsNewer: true });
		const text = { type: 'doc', content: [{ type: 'paragraph' }] };
		const storage = memoryStorage();
		const drafts = new ComposerDraftState(() => storage);
		drafts.register({
			threadKey: () => 'channel:1',
			content: () => text,
			hasAttachments: () => false
		});
		setupResult.deps.saveDraft.mockImplementation(() => void drafts.saveForReload());
		await setupResult.state.check();
		await flush();
		return { ...setupResult, drafts, text };
	}

	it('saves nothing on Reload itself, only when the page goes away', async () => {
		const { state, deps, drafts, firePageHide, text } = await readyWithOpenComposer();

		await state.reload();
		expect(deps.saveDraft).not.toHaveBeenCalled();
		expect(drafts.takeRestored('channel:1')).toBeUndefined();

		firePageHide();
		expect(deps.saveDraft).toHaveBeenCalledTimes(1);
		expect(drafts.takeRestored('channel:1')).toEqual(text);
	});

	it('saves nothing for a cancelled reload: no pagehide fires, so no stale draft', async () => {
		const { state, deps, drafts } = await readyWithOpenComposer();

		await state.reload();
		await vi.advanceTimersByTimeAsync(RELOAD_STUCK_MS);

		expect(state.phase).toBe('ready');
		expect(deps.saveDraft).not.toHaveBeenCalled();
		expect(drafts.takeRestored('channel:1')).toBeUndefined();
	});

	it('still saves when a slow reload commits after the stuck timeout: the listener stays armed', async () => {
		const { state, deps, drafts, firePageHide, text } = await readyWithOpenComposer();

		await state.reload();
		await vi.advanceTimersByTimeAsync(RELOAD_STUCK_MS + 5_000);
		expect(state.phase).toBe('ready');

		firePageHide();

		expect(deps.saveDraft).toHaveBeenCalledTimes(1);
		expect(drafts.takeRestored('channel:1')).toEqual(text);
	});

	it('replaces the armed listener on a new Reload, so one pagehide saves once', async () => {
		const { state, deps, armedPageHideListeners, firePageHide } = await readyWithOpenComposer();

		await state.reload();
		await vi.advanceTimersByTimeAsync(RELOAD_STUCK_MS);
		await state.reload();
		expect(deps.onPageHide).toHaveBeenCalledTimes(2);
		expect(armedPageHideListeners()).toBe(1);

		firePageHide();

		expect(deps.saveDraft).toHaveBeenCalledTimes(1);
		expect(armedPageHideListeners()).toBe(0);
	});

	it('does not arm a listener while offline', async () => {
		const { state, deps, goOffline } = await readyWithOpenComposer();

		goOffline();
		await state.reload();

		expect(deps.onPageHide).not.toHaveBeenCalled();
	});
});

describe('UpdateState other tabs', () => {
	it('shows the notice, without reloading, when another tab moved the worker on to a newer build', async () => {
		const { state, deps, changes } = setup({ serverIsNewer: true });
		state.start();
		await flush();

		changes.fire();
		await flush();

		expect(state.phase).toBe('ready');
		expect(deps.reload).not.toHaveBeenCalled();
	});

	it("ignores a controller change to this page's own build", async () => {
		const { state, deps, changes } = setup({ serverIsNewer: false });
		state.start();
		await flush();

		changes.fire();
		await flush();

		expect(deps.checkVersion).toHaveBeenCalledTimes(1);
		expect(state.phase).toBe('idle');
	});

	it('shows the notice on a controller change while preparing', async () => {
		const { state, changes } = setup({ serverIsNewer: true });
		state.start();
		await state.check();
		await flush();
		expect(state.phase).toBe('preparing');

		changes.fire();
		await flush();

		expect(state.phase).toBe('ready');
	});
});

describe('UpdateState adopting a worker from this build', () => {
	it('activates a waiting worker from the same build without reloading', async () => {
		const { state, registration, workerVersions, changes, deps } = setup();
		const worker = new FakeWorker();
		worker.state = 'installed';
		registration!.waiting = worker;
		workerVersions.set(worker, 'page-v');

		state.start();
		await flush();
		expect(worker.postMessage).toHaveBeenCalledWith({ type: 'skip-waiting' });

		changes.fire();
		worker.setState('activated');
		await flush();

		expect(deps.checkVersion).not.toHaveBeenCalled();
		expect(deps.reload).not.toHaveBeenCalled();
		expect(state.phase).toBe('idle');
	});

	it('leaves a waiting worker from another build waiting', async () => {
		const { state, registration, workerVersions } = setup();
		const worker = new FakeWorker();
		worker.state = 'installed';
		registration!.waiting = worker;
		workerVersions.set(worker, 'newer-v');

		state.start();
		await flush();

		expect(worker.postMessage).not.toHaveBeenCalled();
	});

	it('leaves a waiting worker that does not answer waiting', async () => {
		const { state, registration } = setup();
		const worker = new FakeWorker();
		worker.state = 'installed';
		registration!.waiting = worker;

		state.start();
		await flush();

		expect(worker.postMessage).not.toHaveBeenCalled();
	});

	it('activates a worker from the same build that finishes installing later', async () => {
		const { state, registration, workerVersions } = setup();
		state.start();
		await flush();

		const worker = new FakeWorker();
		workerVersions.set(worker, 'page-v');
		registration!.installing = worker;
		registration!.dispatchEvent(new Event('updatefound'));
		await flush();
		expect(worker.postMessage).not.toHaveBeenCalled();

		registration!.installing = null;
		registration!.waiting = worker;
		worker.setState('installed');
		await flush();

		expect(worker.postMessage).toHaveBeenCalledWith({ type: 'skip-waiting' });
	});

	it('registers its watchers once however often it starts', async () => {
		const { state, deps, changes } = setup();

		state.start();
		state.start();
		await flush();

		expect(deps.watchUpdated).toHaveBeenCalledTimes(1);
		expect(changes.count).toBe(1);
	});
});
