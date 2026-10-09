import { historyApi } from '$lib/requests/history';
import { normalizeError } from '$lib/requests/errors';
import { db, localHistoryAvailable, localHistoryReady } from '$lib/utils/db';
import { runHistorySync, type HistoryApi } from '$lib/utils/historySync';
import { serversState } from './serversState.svelte';

const START_DELAY_MS = 3000;
const RETRY_FIRST_MS = 30_000;
const RETRY_MAX_MS = 300_000;
const RUN_GAP_MS = 60_000;
const LOCK_RECHECK_MS = 60_000;
const COUNT_EVERY_PAGES = 20;
const LOCK_NAME = 'history-sync';

function saveData(): boolean {
	if (typeof navigator === 'undefined') return false;
	return (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;
}

type Status = 'unavailable' | 'idle' | 'running' | 'done';

/** Keeps the device's copy of every readable conversation current. One run at a time,
 *  and only one tab runs at all. */
class HistorySyncState {
	status = $state<Status>(localHistoryAvailable ? 'idle' : 'unavailable');
	threads = $state(0);
	complete = $state(0);
	messages = $state(0);

	private startTimer: ReturnType<typeof setTimeout> | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private retryDelay = RETRY_FIRST_MS;
	private controller: AbortController | null = null;
	private running: Promise<void> | null = null;
	private queued = false;
	private blocked = false;
	private lastStartedAt: number | null = null;
	private pages = 0;
	private listingFailed = false;

	/** Ask for a run. Requests made while one is waiting or running share a single run. */
	request(): void {
		if (!localHistoryAvailable || this.blocked) return;
		if (this.running) {
			this.queued = true;
			return;
		}
		this.scheduleStart(START_DELAY_MS);
	}

	/** Starts a run after `minDelay`, and never sooner than RUN_GAP_MS after the last run began. */
	private scheduleStart(minDelay: number) {
		if (this.startTimer) return;
		const untilGapOver =
			this.lastStartedAt == null ? 0 : RUN_GAP_MS - (Date.now() - this.lastStartedAt);
		const delay = Math.max(minDelay, untilGapOver);
		this.startTimer = setTimeout(() => {
			this.startTimer = null;
			this.start();
		}, delay);
	}

	async stop(): Promise<void> {
		this.queued = false;
		this.clearTimers();
		this.controller?.abort();
		await this.running;
		this.retryDelay = RETRY_FIRST_MS;
		this.lastStartedAt = null;
		this.threads = 0;
		this.complete = 0;
		this.messages = 0;
		this.status = localHistoryAvailable && !this.blocked ? 'idle' : 'unavailable';
	}

	private clearTimers() {
		if (this.startTimer) clearTimeout(this.startTimer);
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.startTimer = null;
		this.retryTimer = null;
	}

	private start() {
		if (this.running || this.blocked) return;
		this.clearTimers();
		this.lastStartedAt = Date.now();
		const controller = new AbortController();
		this.controller = controller;
		this.status = 'running';
		this.running = this.execute(controller).finally(() => {
			this.running = null;
			this.controller = null;
			if (this.queued && !controller.signal.aborted) {
				this.queued = false;
				this.scheduleStart(0);
			}
		});
	}

	private async execute(controller: AbortController) {
		if (!(await localHistoryReady())) {
			this.blocked = true;
			this.queued = false;
			this.status = 'unavailable';
			return;
		}
		this.pages = 0;
		this.listingFailed = false;
		let ranHere = false;
		let lockMissed = false;
		try {
			ranHere = await this.withLock(async () => {
				await runHistorySync({
					api: this.countingApi(),
					serverIds: Object.keys(serversState.servers).map(Number),
					preferServerId: serversState.selectedServerId,
					signal: controller.signal,
					fullHistory: !saveData(),
					onProgress: ({ threads, complete }) => {
						this.threads = threads;
						this.complete = complete;
					}
				});
			});
			lockMissed = !ranHere;
			if (this.listingFailed) throw new Error('Could not list every conversation');
			this.retryDelay = RETRY_FIRST_MS;
		} catch (e) {
			if (!controller.signal.aborted) {
				console.warn('Message history sync failed', e);
				this.scheduleRetry();
			}
		}
		await this.refreshCount();
		if (lockMissed) await this.followOtherTab(controller.signal);
		const finished = ranHere && !this.listingFailed && !controller.signal.aborted;
		this.status = finished && this.complete === this.threads ? 'done' : 'idle';
	}

	/** Another tab is syncing: mirror its progress and look again later, in case it closes. */
	private async followOtherTab(signal: AbortSignal) {
		try {
			const rows = await db.threadSync.toArray();
			this.threads = rows.length;
			this.complete = rows.filter((row) => row.complete).length;
		} catch (e) {
			console.warn('Failed to read local sync progress', e);
		}
		if (signal.aborted) return;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.start();
		}, LOCK_RECHECK_MS);
	}

	/** False when another tab holds the lock, so this tab leaves the work to it. */
	private async withLock(work: () => Promise<void>): Promise<boolean> {
		const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
		if (!locks) {
			await work();
			return true;
		}
		return locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
			if (!lock) return false;
			await work();
			return true;
		});
	}

	private scheduleRetry() {
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.start();
		}, this.retryDelay);
		this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
	}

	private async refreshCount() {
		try {
			this.messages = await db.messages.count();
		} catch (e) {
			console.warn('Failed to count local messages', e);
		}
	}

	/** Counts pages for the message total, and notes listings that failed for a reason a
	 *  later run may fix. A server we can no longer see (403/404) is not one of them. */
	private countingApi(): HistoryApi {
		const noteListing = async <T>(call: () => Promise<T>): Promise<T> => {
			try {
				return await call();
			} catch (e) {
				const status = normalizeError(e).status;
				if (status !== 403 && status !== 404) this.listingFailed = true;
				throw e;
			}
		};
		return {
			channels: (serverId) => noteListing(() => serversState.loadServerChannels(serverId)),
			posts: (channelId, cursor, signal) =>
				noteListing(() => historyApi.posts(channelId, cursor, signal)),
			conversations: (signal) => noteListing(() => historyApi.conversations(signal)),
			page: async (thread, before, signal) => {
				const page = await historyApi.page(thread, before, signal);
				if (++this.pages % COUNT_EVERY_PAGES === 0) void this.refreshCount();
				return page;
			}
		};
	}
}

export const historySyncState = new HistorySyncState();

/** The one-line status shown to the person, or null when history isn't kept on this device. */
export function historyStatusLabel(state: HistorySyncState = historySyncState): string | null {
	if (state.status === 'unavailable') return null;
	if (state.status === 'done') {
		return `Message history: on this device, ${state.messages.toLocaleString()} messages`;
	}
	if (state.threads === 0) return 'Message history: waiting';
	return `Message history: downloading, ${state.complete} of ${state.threads} conversations`;
}
