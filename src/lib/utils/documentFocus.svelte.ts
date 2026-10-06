import { phoneState } from '$lib/states/phoneState.svelte';

const IDLE_AFTER_MS = 5 * 60_000;
const HEARTBEAT_MS = 60_000;
const INPUT_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;

export type ActivityState = 'active' | 'idle';

/** Reactive "the document is visible and focused" signal, shared by every
 *  MessageList instance that needs to know whether its thread is being read.
 *  `active` additionally requires input within the last few minutes. */
class DocumentFocusState {
	visible = $state(typeof document !== 'undefined' ? document.visibilityState === 'visible' : true);
	focused = $state(typeof document !== 'undefined' ? document.hasFocus() : true);
	active = $state(false);

	/** The page is in front of the user: visible, focused, and not under the phone navigation. */
	get reading() {
		return this.visible && this.focused && !phoneState.navCoversContent;
	}

	private attached = false;
	private lastInputAt = 0;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private lastEmittedAt = 0;
	private listeners = new Set<(state: ActivityState) => void>();

	attach() {
		if (this.attached || typeof document === 'undefined' || typeof window === 'undefined') return;
		this.attached = true;

		const update = () => {
			this.visible = document.visibilityState === 'visible';
			this.focused = document.hasFocus();
			this.recompute();
		};

		const onInput = () => {
			this.lastInputAt = Date.now();
			this.armIdleTimer();
			this.recompute();
		};

		document.addEventListener('visibilitychange', update);
		window.addEventListener('focus', update);
		window.addEventListener('blur', update);
		for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, { passive: true });

		if (this.visible && this.focused) onInput();
	}

	/** Fires on every flip, and as an `active` heartbeat while input continues. */
	onActivity(listener: (state: ActivityState) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private armIdleTimer() {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = setTimeout(() => this.recompute(), IDLE_AFTER_MS);
	}

	private recompute() {
		const now = Date.now();
		const active = this.visible && this.focused && now - this.lastInputAt < IDLE_AFTER_MS;
		const flipped = active !== this.active;
		this.active = active;

		if (flipped || (active && now - this.lastEmittedAt >= HEARTBEAT_MS)) {
			this.lastEmittedAt = now;
			const state: ActivityState = active ? 'active' : 'idle';
			this.listeners.forEach((listener) => listener(state));
		}
	}
}

export const documentFocusState = new DocumentFocusState();
