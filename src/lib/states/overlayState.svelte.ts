import type { Component } from 'svelte';

interface OverlayEntry<Props extends Record<string, unknown> = Record<string, unknown>> {
	component: Component<Props>;
	props: Props;
}

class OverlayState {
	private current: OverlayEntry | null = $state(null);

	/** Whether an overlay is currently visible. */
	readonly isOpen: boolean = $derived(this.current !== null);

	/** The active overlay component, or `null` when closed. */
	get component() {
		return this.current?.component ?? null;
	}

	/** Props to pass to the active overlay component. */
	get props() {
		return this.current?.props ?? {};
	}

	/** Open an overlay with the given component and optional props. */
	open<Props extends Record<string, unknown>>(component: Component<Props>, props?: Props): void {
		this.current = {
			component: component as Component<Record<string, unknown>>,
			props: (props ?? {}) as Record<string, unknown>
		};
	}

	/** Close the active overlay. */
	close(): void {
		this.current = null;
	}
}

export const overlayState = new OverlayState();
