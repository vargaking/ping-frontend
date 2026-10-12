import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

async function loadWithSaved(saved: object) {
	vi.stubGlobal('window', {});
	vi.stubGlobal('localStorage', {
		getItem: () => JSON.stringify(saved),
		setItem: () => {}
	});
	vi.resetModules();
	return (await import('./voiceSettingsState.svelte')).voiceSettingsState;
}

describe('saved screen quality', () => {
	it.each([
		['1080p60', '1080p60'],
		['1440p30', '1440p30'],
		['1440p60', '1440p60'],
		['4k30', '1080p30']
	])('loads %s as %s', async (saved, expected) => {
		const state = await loadWithSaved({ screenPreset: saved });

		expect(state.screenPreset).toBe(expected);
	});
});
