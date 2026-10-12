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

describe('refreshDevices', () => {
	it('leaves out the virtual nodes of the desktop screen-share sound', async () => {
		const device = (kind: string, label: string) => ({ kind, label, deviceId: label });
		vi.doMock('livekit-client', async (importOriginal) => ({
			...(await importOriginal<typeof import('livekit-client')>()),
			Room: {
				getLocalDevices: async () => [
					device('audioinput', 'Built-in Microphone'),
					device('audioinput', 'vencord-screen-share'),
					device('audioinput', 'Monitor of vencord-sink'),
					device('audiooutput', 'Speakers'),
					device('audiooutput', 'Vencord-Sink')
				]
			}
		}));
		const state = await loadWithSaved({});

		await state.refreshDevices();

		expect(state.inputs.map((d) => d.label)).toEqual(['Built-in Microphone']);
		expect(state.outputs.map((d) => d.label)).toEqual(['Speakers']);
		vi.doUnmock('livekit-client');
	});
});
