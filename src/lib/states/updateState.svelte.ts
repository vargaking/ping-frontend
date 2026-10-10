import { untrack } from 'svelte';
import { updated } from '$app/state';
import { version } from '$app/environment';
import { composerDraftState } from './composerDraftState.svelte';
import { shouldCheck } from '$lib/utils/updateNotice';
import {
	activateWorker,
	askWorkerVersion,
	whenWorkerSettles,
	type RegistrationLike,
	type WorkerLike
} from '$lib/utils/workerUpdate';

export type UpdatePhase = 'idle' | 'preparing' | 'ready' | 'reloading';

export const CHECK_MIN_GAP_MS = 30_000;
export const PREPARE_RETRY_MS = [15_000, 60_000, 180_000];
export const ACTIVATE_TIMEOUT_MS = 10_000;
export const RELOAD_STUCK_MS = 10_000;

export type UpdateDeps = {
	pageVersion: string;
	/** True when the server has a different build than this page. */
	checkVersion: () => Promise<boolean>;
	/** Calls back once the background poll has found a different build. */
	watchUpdated: (onUpdated: () => void) => void;
	getRegistration: () => Promise<RegistrationLike | null>;
	/** False for a page no worker controls: a new worker activates by itself, so none ever waits. */
	hasController: () => boolean;
	onControllerChange: (listener: () => void) => () => void;
	askVersion: (worker: WorkerLike) => Promise<string | null>;
	online: () => boolean;
	/** Calls back once, when the page is going away. Returns a function that disarms it. */
	onPageHide: (listener: () => void) => () => void;
	saveDraft: () => void;
	reload: () => void;
	now: () => number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Notices a new deploy, gets its service worker installed, and moves this page onto it when
 * the user asks. Never reloads on its own.
 */
export class UpdateState {
	phase = $state<UpdatePhase>('idle');
	dismissed = $state(false);
	offline = $state(false);

	private started = false;
	private startup: Promise<void> = Promise.resolve();
	private lastCheckAt: number | null = null;
	private checking: Promise<void> | null = null;
	private ownActivations = 0;
	private disarmDraftSave: (() => void) | null = null;

	constructor(private deps: UpdateDeps) {}

	get available(): boolean {
		return this.phase === 'ready' || this.phase === 'reloading';
	}

	get noticeVisible(): boolean {
		return this.available && !this.dismissed;
	}

	start() {
		if (this.started) return;
		this.started = true;
		this.deps.watchUpdated(() => this.found());
		this.deps.onControllerChange(() => void this.controllerChanged());
		this.startup = this.adoptSameBuildWorkers();
	}

	check(): Promise<void> {
		if (this.phase !== 'idle') return Promise.resolve();
		if (this.checking) return this.checking;
		const now = this.deps.now();
		if (!shouldCheck(now, this.lastCheckAt, CHECK_MIN_GAP_MS)) return Promise.resolve();
		this.lastCheckAt = now;
		this.checking = this.deps
			.checkVersion()
			.then((isNew) => {
				if (isNew) this.found();
			})
			.catch(() => {})
			.finally(() => (this.checking = null));
		return this.checking;
	}

	dismiss() {
		this.dismissed = true;
	}

	async reload(): Promise<void> {
		if (this.phase === 'reloading') return;
		if (!this.deps.online()) {
			this.offline = true;
			return;
		}
		this.offline = false;
		this.phase = 'reloading';
		console.info('Reloading for the new version');
		this.armDraftSave();
		const waiting = (await this.deps.getRegistration())?.waiting;
		if (waiting) await this.activate(waiting);
		this.deps.reload();
		// A beforeunload prompt answered with "stay" leaves this page running.
		setTimeout(() => {
			if (this.phase === 'reloading') this.phase = 'ready';
		}, RELOAD_STUCK_MS);
	}

	/**
	 * The draft is saved only when the page really goes away, so a reload that is cancelled saves
	 * nothing and one that is merely slow still does. It stays armed after the stuck timeout, as
	 * the reload may yet commit; only a new Reload replaces it.
	 */
	private armDraftSave() {
		this.disarmDraftSave?.();
		this.disarmDraftSave = this.deps.onPageHide(() => {
			this.disarmDraftSave = null;
			this.deps.saveDraft();
		});
	}

	private found() {
		if (this.phase !== 'idle') return;
		console.info('New version found');
		this.phase = 'preparing';
		void this.prepare();
	}

	private async prepare() {
		if (!this.deps.hasController()) {
			this.phase = 'ready';
			return;
		}
		await this.startup;
		const registration = await this.deps.getRegistration();
		for (const delay of [0, ...PREPARE_RETRY_MS]) {
			if (delay) await sleep(delay);
			if (this.phase !== 'preparing') return;
			if (!registration || (await this.newWorkerWaiting(registration))) break;
		}
		if (this.phase === 'preparing') this.phase = 'ready';
	}

	private async newWorkerWaiting(registration: RegistrationLike): Promise<boolean> {
		try {
			await registration.update();
		} catch {
			// Offline, or the worker script didn't load: try again later.
		}
		const installing = registration.installing;
		if (installing) await whenWorkerSettles(installing);
		return registration.waiting != null;
	}

	/** Another tab's reload, or a newly opened one, put a newer worker in charge of this page. */
	private async controllerChanged() {
		if (this.ownActivations > 0 || this.phase === 'ready' || this.phase === 'reloading') return;
		if (this.phase === 'idle' && !(await this.deps.checkVersion().catch(() => false))) return;
		if (this.phase === 'idle' || this.phase === 'preparing') this.phase = 'ready';
	}

	private async adoptSameBuildWorkers() {
		const registration = await this.deps.getRegistration();
		if (!registration) return;
		const adoptOnceInstalled = () => {
			const installing = registration.installing;
			if (installing) {
				void whenWorkerSettles(installing).then(() => this.adoptIfSameBuild(registration));
			}
		};
		registration.addEventListener('updatefound', adoptOnceInstalled);
		adoptOnceInstalled();
		await this.adoptIfSameBuild(registration);
	}

	/** A worker from this page's own deploy can take over at once: its files are this page's files. */
	private async adoptIfSameBuild(registration: RegistrationLike) {
		const waiting = registration.waiting;
		if (!waiting || this.phase === 'reloading') return;
		if ((await this.deps.askVersion(waiting)) !== this.deps.pageVersion) return;
		await this.activate(waiting);
	}

	private async activate(worker: WorkerLike) {
		this.ownActivations++;
		try {
			await activateWorker(worker, this.deps.onControllerChange, ACTIVATE_TIMEOUT_MS);
		} finally {
			this.ownActivations--;
		}
	}
}

function serviceWorkers(): ServiceWorkerContainer | null {
	return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
		? navigator.serviceWorker
		: null;
}

export const updateState = new UpdateState({
	pageVersion: version,
	checkVersion: () => updated.check(),
	watchUpdated: (onUpdated) => {
		$effect.root(() => {
			$effect(() => {
				if (updated.current) untrack(onUpdated);
			});
		});
	},
	getRegistration: async () => {
		try {
			return (await serviceWorkers()?.getRegistration()) ?? null;
		} catch {
			return null;
		}
	},
	hasController: () => serviceWorkers()?.controller != null,
	onControllerChange: (listener) => {
		const container = serviceWorkers();
		container?.addEventListener('controllerchange', listener);
		return () => container?.removeEventListener('controllerchange', listener);
	},
	askVersion: (worker) => askWorkerVersion(worker),
	online: () => navigator.onLine,
	onPageHide: (listener) => {
		window.addEventListener('pagehide', listener, { once: true });
		return () => window.removeEventListener('pagehide', listener);
	},
	saveDraft: () => composerDraftState.saveForReload(),
	reload: () => location.reload(),
	now: () => Date.now()
});
