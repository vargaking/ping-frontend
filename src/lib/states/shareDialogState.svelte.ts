import { toast } from 'svelte-sonner';
import { desktop, type ScreenSource } from '$lib/desktop';
import { voiceState } from './voiceState.svelte';

class ShareDialogState {
	open = $state(false);
	/** Desktop sources for the grid; null in a browser or before they load. */
	sources = $state<ScreenSource[] | null>(null);
	selected = $state<string | null>(null);
	/** Older shells only offer sources once the capture has started: the dialog then shows only the grid. */
	pickOnly = $state(false);

	// The source chosen in the dialog, handed to the shell when it asks for one.
	private armed: string | null = null;
	// The shell offered other sources than the armed one, so the capture was refused.
	private missedArmed = false;
	private pending: ((id: string | null) => void) | null = null;
	private loadSeq = 0;

	/** The OS shows its own chooser each time sources are listed, and returns only what was picked. */
	get systemPicker(): boolean {
		return !!desktop?.systemPicker && !!desktop.listScreenSources;
	}

	show() {
		if (voiceState.sharing || voiceState.startingShare) return;
		this.open = true;
		this.pickOnly = false;
		this.armed = null;
		this.load();
	}

	/** Lists again, which reopens the system chooser. */
	change() {
		if (!this.open) return;
		this.load();
	}

	close() {
		this.open = false;
		this.armed = null;
		this.loadSeq++;
		this.settle(null);
		desktop?.shareDialogClosed?.();
	}

	async share() {
		if (voiceState.sharing || voiceState.startingShare) return;
		if (desktop?.listScreenSources) {
			if (!this.selected) return;
			this.armed = this.selected;
		}
		this.missedArmed = false;
		this.open = false;
		this.loadSeq++;
		try {
			await voiceState.startScreenShare();
		} finally {
			this.armed = null;
		}
		if (this.missedArmed) {
			this.missedArmed = false;
			toast.error(
				"Couldn't start screen share: the chosen screen or window is no longer available. Try again."
			);
		}
	}

	/** The shell wants a source for a capture the page started. */
	handleShellRequest(sources: ScreenSource[]): Promise<string | null> {
		if (this.armed !== null) {
			const id = this.armed;
			this.armed = null;
			if (sources.some((s) => s.id === id)) return Promise.resolve(id);
			// Some shells list again for the capture, with new ids for the same pick.
			if (sources.length === 1) return Promise.resolve(sources[0].id);
			this.missedArmed = sources.length > 0;
			return Promise.resolve(null);
		}
		this.settle(null);
		this.sources = sources;
		this.selected = null;
		this.pickOnly = true;
		this.open = true;
		return new Promise((resolve) => {
			this.pending = resolve;
		});
	}

	choose(id: string | null) {
		this.open = false;
		this.settle(id);
	}

	private load() {
		this.selected = null;
		const seq = ++this.loadSeq;
		this.sources = null;
		if (!desktop?.listScreenSources) return;
		desktop
			.listScreenSources()
			.catch(() => [])
			.then((sources) => {
				if (seq !== this.loadSeq || !this.open) return;
				this.sources = sources;
				if (this.systemPicker) this.selected = sources[0]?.id ?? null;
			});
	}

	private settle(id: string | null) {
		const resolve = this.pending;
		this.pending = null;
		resolve?.(id);
	}
}

export const shareDialogState = new ShareDialogState();
