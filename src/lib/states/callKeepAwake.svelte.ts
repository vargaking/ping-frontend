import { untrack } from 'svelte';
import { phoneState } from './phoneState.svelte';
import { voiceState } from './voiceState.svelte';

const NOTE_SEEN_KEY = 'voice.phoneNoteSeen';

function readNoteSeen(): boolean {
	try {
		return localStorage.getItem(NOTE_SEEN_KEY) === 'true';
	} catch {
		return false;
	}
}

/** Keeps a phone's screen on during a voice call, and tells the user once that
 *  leaving the app pauses the call. Needs `start()` once the app has mounted. */
class CallKeepAwake {
	/** The one-time note was shown on an earlier call, or dismissed. */
	private noteSeen = $state(readNoteSeen());
	private noteShown = false;
	private started = false;
	private wanted = false;
	private requesting = false;
	private sentinel: WakeLockSentinel | null = null;

	readonly inCall = $derived(
		voiceState.connecting || voiceState.connected || voiceState.reconnecting
	);
	readonly noteVisible = $derived(phoneState.phone && this.inCall && !this.noteSeen);

	start() {
		if (this.started || typeof document === 'undefined') return;
		this.started = true;
		document.addEventListener('visibilitychange', () => void this.sync());

		$effect.root(() => {
			$effect(() => {
				const hold = phoneState.touch && (voiceState.connected || voiceState.reconnecting);
				untrack(() => {
					this.wanted = hold;
					void this.sync();
				});
			});

			$effect(() => {
				const visible = this.noteVisible;
				const inCall = this.inCall;
				untrack(() => {
					if (visible) this.noteShown = true;
					if (!inCall && this.noteShown) {
						this.noteShown = false;
						this.markNoteSeen();
					}
				});
			});
		});
	}

	dismissNote() {
		this.noteShown = false;
		this.markNoteSeen();
	}

	private markNoteSeen() {
		this.noteSeen = true;
		try {
			localStorage.setItem(NOTE_SEEN_KEY, 'true');
		} catch {
			/* storage blocked: the note shows again next load */
		}
	}

	// Browsers drop a wake lock when the page is hidden, so it is taken again on return.
	private shouldHold(): boolean {
		return this.wanted && document.visibilityState === 'visible';
	}

	private async sync() {
		if (!this.shouldHold()) {
			this.release();
			return;
		}
		if (this.sentinel || this.requesting || !navigator.wakeLock) return;

		this.requesting = true;
		try {
			const sentinel = await navigator.wakeLock.request('screen');
			sentinel.addEventListener('release', () => {
				if (this.sentinel === sentinel) this.sentinel = null;
			});
			this.sentinel = sentinel;
		} catch {
			/* refused, e.g. low battery: the screen just locks as usual */
		} finally {
			this.requesting = false;
		}
		if (!this.shouldHold()) this.release();
	}

	private release() {
		const sentinel = this.sentinel;
		this.sentinel = null;
		void sentinel?.release().catch(() => {});
	}
}

export const callKeepAwake = new CallKeepAwake();
