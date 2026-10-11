import { expect, it } from 'vitest';
import type { Component } from 'svelte';
import { overlayState } from './overlayState.svelte';

it('close removes the open overlay and its props', () => {
	overlayState.open((() => {}) as unknown as Component<{ id: number }>, { id: 3 });
	expect(overlayState.component).not.toBeNull();

	overlayState.close();

	expect(overlayState.component).toBeNull();
	expect(overlayState.props).toEqual({});
});
