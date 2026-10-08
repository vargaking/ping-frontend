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
	private pending: ((id: string | null) => void) | null = null;
	private loadSeq = 0;

	show() {
		if (voiceState.sharing || voiceState.startingShare) return;
		this.open = true;
		this.pickOnly = false;
		this.selected = null;
		this.armed = null;
		const seq = ++this.loadSeq;
		this.sources = null;
		if (!desktop?.listScreenSources) return;
		desktop
			.listScreenSources()
			.catch(() => [])
			.then((sources) => {
				if (seq === this.loadSeq && this.open) this.sources = sources;
			});
	}

	close() {
		this.open = false;
		this.armed = null;
		this.loadSeq++;
		this.settle(null);
	}

	async share() {
		if (voiceState.sharing || voiceState.startingShare) return;
		if (desktop?.listScreenSources) {
			if (!this.selected) return;
			this.armed = this.selected;
		}
		this.open = false;
		this.loadSeq++;
		try {
			await voiceState.startScreenShare();
		} finally {
			this.armed = null;
		}
	}

	/** The shell wants a source for a capture the page started. */
	handleShellRequest(sources: ScreenSource[]): Promise<string | null> {
		if (this.armed !== null) {
			const id = this.armed;
			this.armed = null;
			return Promise.resolve(sources.some((s) => s.id === id) ? id : null);
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

	private settle(id: string | null) {
		const resolve = this.pending;
		this.pending = null;
		resolve?.(id);
	}
}

export const shareDialogState = new ShareDialogState();
