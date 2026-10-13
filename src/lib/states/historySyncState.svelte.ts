import { historyApi } from '$lib/requests/history';
import { normalizeError } from '$lib/requests/errors';
import { db, localHistoryAvailable, localHistoryReady } from '$lib/utils/db';
import { forgetSyncedChannels, runHistorySync, type HistoryApi } from '$lib/utils/historySync';
import {
	browserSavesData,
	DOWNLOAD_PREFERENCE_KEY,
	downloadMode,
	readDownloadPreference,
	writeDownloadPreference
} from '$lib/utils/historyPreference';
import { removeCursor, resetLocalHistory } from '$lib/utils/messageChanges';
import { serversState } from './serversState.svelte';
import { usersState } from './usersState.svelte';

const START_DELAY_MS = 3000;
const RETRY_FIRST_MS = 30_000;
const RETRY_MAX_MS = 300_000;
const RUN_GAP_MS = 60_000;
const LOCK_RECHECK_MS = 60_000;
const COUNT_EVERY_PAGES = 20;
const LOCK_NAME = 'history-sync';
const CLEARED_KEY = 'history:cleared';

type Status = 'unavailable' | 'off' | 'idle' | 'running' | 'done';

/** Keeps the device's copy of every readable conversation current. One run at a time,
 *  and only one tab runs at all. */
class HistorySyncState {
	/** True or false once the person chose on this device, null before. */
	private preference = $state<boolean | null>(readDownloadPreference());
	status = $state<Status>(
		!localHistoryAvailable ? 'unavailable' : this.preference === false ? 'off' : 'idle'
	);
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
	private clearing = false;
	private lastStartedAt: number | null = null;
	private pages = 0;
	private listingFailed = false;
	private stops = 0;
	/** Remembered because the signed-in user is already gone by the time stop() runs. */
	private userId: number | null = null;

	constructor() {
		if (typeof window === 'undefined') return;
		window.addEventListener('storage', (event) => {
			if (event.key === DOWNLOAD_PREFERENCE_KEY) void this.followPreference();
			else if (event.key === CLEARED_KEY) void this.followClear();
		});
	}

	/** Whether the full download is switched on; an unset preference counts as on. */
	get downloadOn(): boolean {
		return this.preference !== false;
	}

	/** On with no choice made and the browser asking to save data: only the newest messages come. */
	get savingData(): boolean {
		return downloadMode(this.preference, browserSavesData()) === 'catchUp';
	}

	/** Turning it off keeps what is stored; the run still lists servers and channels so that
	 *  what the person can no longer see is purged. */
	async setDownload(on: boolean): Promise<void> {
		if (this.downloadOn === on && this.preference !== null) return;
		writeDownloadPreference(on);
		this.preference = on;
		await this.rerun();
	}

	/** Deletes every stored message and starts the download again, unless it is switched off.
	 *  Other tabs stop writing first. */
	async clear(): Promise<void> {
		if (!localHistoryAvailable || this.blocked) return;
		this.userId = usersState.loggedInUser?.id ?? this.userId;
		const stops = this.stops;
		try {
			localStorage.setItem(CLEARED_KEY, String(Date.now()));
		} catch {
			// Without storage there is no other tab to tell.
		}
		this.clearing = true;
		try {
			await this.haltRun();
			if (stops !== this.stops) return;
			this.clearTimers();
			this.queued = false;
			// Waits for a run in another tab to notice the signal and let go of the lock.
			await this.exclusively(async () => {
				await resetLocalHistory();
				if (this.userId != null) removeCursor(this.userId);
			});
		} catch (e) {
			if (stops === this.stops) this.restart(this.downloadOn);
			throw e;
		} finally {
			this.clearing = false;
		}
		if (stops === this.stops) this.afterClear();
	}

	/** Ask for a run. Requests made while one is waiting or running share a single run. */
	request(): void {
		if (!localHistoryAvailable || this.blocked) return;
		this.userId = usersState.loggedInUser?.id ?? this.userId;
		if (this.running) {
			this.queued = true;
			return;
		}
		this.scheduleStart(START_DELAY_MS);
	}

	/** An import added older messages to these channels (all of the server when null): walk them again. */
	async forgetChannels(serverId: number, channelIds: number[] | null): Promise<void> {
		if (!localHistoryAvailable || this.blocked) return;
		const stops = this.stops;
		if (this.running) await this.haltRun();
		if (stops !== this.stops) return;
		try {
			await forgetSyncedChannels(serverId, channelIds);
		} catch (e) {
			console.warn('Failed to reset local sync progress', e);
		}
		if (stops !== this.stops) return;
		this.clearTimers();
		this.lastStartedAt = null;
		this.queued = false;
		if (this.status === 'done') this.status = 'idle';
		// A run before the server list loads would purge every server's local history.
		if (serversState.loaded) this.scheduleStart(START_DELAY_MS);
	}

	private async haltRun(): Promise<void> {
		if (!this.running) return;
		this.controller?.abort();
		await this.running;
	}

	private restingStatus(): Status {
		if (!localHistoryAvailable || this.blocked) return 'unavailable';
		return this.downloadOn ? 'idle' : 'off';
	}

	/** Starts over after a change to how much is downloaded. The run gap does not apply. */
	private async rerun(): Promise<void> {
		if (!localHistoryAvailable || this.blocked) return;
		this.status = this.restingStatus();
		const stops = this.stops;
		await this.haltRun();
		if (stops !== this.stops) return;
		this.restart(true);
	}

	private restart(schedule: boolean) {
		this.clearTimers();
		this.retryDelay = RETRY_FIRST_MS;
		this.lastStartedAt = null;
		this.queued = false;
		this.status = this.restingStatus();
		// A run before the server list loads would purge every server's local history.
		const ready = serversState.loaded && usersState.loggedInUser != null;
		if (schedule && ready) this.scheduleStart(START_DELAY_MS);
	}

	private afterClear() {
		this.threads = 0;
		this.complete = 0;
		this.messages = 0;
		this.restart(this.downloadOn);
	}

	private async followPreference(): Promise<void> {
		const preference = readDownloadPreference();
		if (preference === this.preference) return;
		this.preference = preference;
		await this.rerun();
	}

	private async followClear(): Promise<void> {
		if (!localHistoryAvailable || this.blocked) return;
		const stops = this.stops;
		await this.haltRun();
		if (stops !== this.stops) return;
		this.afterClear();
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
		this.stops++;
		this.queued = false;
		this.clearTimers();
		this.controller?.abort();
		await this.running;
		if (this.userId != null) removeCursor(this.userId);
		this.userId = null;
		this.retryDelay = RETRY_FIRST_MS;
		this.lastStartedAt = null;
		this.threads = 0;
		this.complete = 0;
		this.messages = 0;
		this.status = this.restingStatus();
	}

	private clearTimers() {
		if (this.startTimer) clearTimeout(this.startTimer);
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.startTimer = null;
		this.retryTimer = null;
	}

	private start() {
		if (this.running || this.blocked || this.clearing) return;
		this.clearTimers();
		this.userId = usersState.loggedInUser?.id ?? this.userId;
		this.lastStartedAt = Date.now();
		const controller = new AbortController();
		this.controller = controller;
		this.status = this.downloadOn ? 'running' : 'off';
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
					userId: this.userId,
					fullHistory: downloadMode(this.preference, browserSavesData()) === 'full',
					listOnly: !this.downloadOn,
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
		if (!this.downloadOn) this.status = 'off';
		else this.status = finished && this.complete === this.threads ? 'done' : 'idle';
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

	/** Waits for the lock, so no other tab is writing while `work` runs. */
	private async exclusively(work: () => Promise<void>): Promise<void> {
		const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
		if (!locks) return work();
		return locks.request(LOCK_NAME, work);
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

	async refreshCount() {
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
			},
			messageChanges: historyApi.messageChanges,
			messagesByIds: historyApi.messagesByIds
		};
	}
}

export const historySyncState = new HistorySyncState();

/** The one-line status shown to the person, or null when history isn't kept on this device. */
export function historyStatusLabel(state: HistorySyncState = historySyncState): string | null {
	if (state.status === 'unavailable') return null;
	if (state.status === 'off') return 'Message history: download is off';
	if (state.status === 'done') {
		return `Message history: on this device, ${state.messages.toLocaleString()} messages`;
	}
	if (state.threads === 0) return 'Message history: waiting';
	return `Message history: downloading, ${state.complete} of ${state.threads} conversations`;
}
