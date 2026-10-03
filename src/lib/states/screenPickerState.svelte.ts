import type { ScreenSource } from '$lib/desktop';

class ScreenPickerState {
	sources = $state<ScreenSource[] | null>(null);
	private resolver: ((id: string | null) => void) | null = null;

	get open(): boolean {
		return this.sources !== null;
	}

	/** Opens the picker. A request still open is cancelled. */
	request(sources: ScreenSource[]): Promise<string | null> {
		this.settle(null);
		this.sources = sources;
		return new Promise((resolve) => {
			this.resolver = resolve;
		});
	}

	choose(id: string | null) {
		this.settle(id);
	}

	private settle(id: string | null) {
		const resolve = this.resolver;
		this.resolver = null;
		this.sources = null;
		resolve?.(id);
	}
}

export const screenPickerState = new ScreenPickerState();
