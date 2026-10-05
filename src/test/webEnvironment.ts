import type { Environment } from 'vitest/environments';

/** Node without a DOM, compiled for the browser so Svelte runes and effects run. */
export default <Environment>{
	name: 'web-runes',
	transformMode: 'web',
	setup() {
		return { teardown() {} };
	}
};
