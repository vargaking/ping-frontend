import { describe, expect, it, vi } from 'vitest';

vi.mock('livekit-client', async (importOriginal) => ({
	...(await importOriginal<typeof import('livekit-client')>()),
	LocalVideoTrack: class {
		source = '';
		constructor(public mediaStreamTrack: MediaStreamTrack) {}
	}
}));

vi.mock('$lib/requests/voice/refreshVoicePresence', () => ({
	refreshVoicePresence: vi.fn(),
	refreshVoicePresenceOnUnload: vi.fn()
}));

import { voiceState } from './voiceState.svelte';
import { voiceSettingsState } from './voiceSettingsState.svelte';

function fakeRoom(disconnect: () => Promise<void>) {
	const stopMic = vi.fn();
	const stopScreen = vi.fn();
	const room = {
		disconnect: vi.fn(disconnect),
		localParticipant: {
			trackPublications: new Map([
				['mic', { track: { mediaStreamTrack: { stop: stopMic } } }],
				['screen', { track: { mediaStreamTrack: { stop: stopScreen } } }],
				['pending', { track: undefined }]
			])
		}
	};
	return { room, stopMic, stopScreen };
}

describe('voiceState.leaveVoice', () => {
	it('stops the mic and screen capture before the disconnect has finished', async () => {
		let finishDisconnect!: () => void;
		const { room, stopMic, stopScreen } = fakeRoom(
			() => new Promise<void>((resolve) => (finishDisconnect = resolve))
		);
		Object.assign(voiceState, { room, channelId: 5, serverId: 1 });

		const leaving = voiceState.leaveVoice();

		expect(stopMic).toHaveBeenCalledOnce();
		expect(stopScreen).toHaveBeenCalledOnce();
		finishDisconnect();
		await leaving;
		expect(voiceState.channelId).toBeNull();
	});

	it('still clears the call when the disconnect fails', async () => {
		const { room } = fakeRoom(() => Promise.reject(new Error('network down')));
		Object.assign(voiceState, { room, channelId: 5, serverId: 1 });

		await voiceState.leaveVoice();

		expect(voiceState.channelId).toBeNull();
		expect(voiceState.serverId).toBeNull();
	});
});

/** A live screen share whose republish waits until `finish` is called. */
function sharingRoom() {
	const mst = { contentHint: '', applyConstraints: vi.fn(async () => {}), stop: vi.fn() };
	let publication: { track: unknown } | undefined = { track: { mediaStreamTrack: mst } };
	let finishPublish!: () => void;
	const localParticipant = {
		identity: 'me',
		getTrackPublication: vi.fn((source: string) =>
			source === 'screen_share' ? publication : undefined
		),
		unpublishTrack: vi.fn(async () => {
			publication = undefined;
		}),
		publishTrack: vi.fn<(track: unknown, options?: object) => Promise<void>>(
			(track) =>
				new Promise<void>((resolve) => {
					finishPublish = () => {
						publication = { track };
						resolve();
					};
				})
		),
		setScreenShareEnabled: vi.fn(async () => {
			publication = undefined;
		})
	};
	return { room: { localParticipant }, localParticipant, mst, finish: () => finishPublish() };
}

describe('voiceState screen share republish', () => {
	it('applies a mode change made while a preset change is republishing', async () => {
		voiceSettingsState.save({ screenPreset: '1080p30', screenContent: 'detail' });
		const { room, localParticipant, mst, finish } = sharingRoom();
		Object.assign(voiceState, { room });

		const quality = voiceState.setScreenQuality('1080p60');
		await vi.waitFor(() => expect(localParticipant.publishTrack).toHaveBeenCalledTimes(1));
		const content = voiceState.setScreenContent('motion');
		finish();
		await vi.waitFor(() => expect(localParticipant.publishTrack).toHaveBeenCalledTimes(2));
		finish();
		await Promise.all([quality, content]);

		expect(localParticipant.publishTrack.mock.calls[1][1]).toMatchObject({
			degradationPreference: 'maintain-framerate'
		});
		expect(mst.contentHint).toBe('motion');
	});

	it('stops a share whose stop was pressed while it was republishing', async () => {
		voiceSettingsState.save({ screenPreset: '1080p30', screenContent: 'detail' });
		const { room, localParticipant, finish } = sharingRoom();
		Object.assign(voiceState, { room });

		const quality = voiceState.setScreenQuality('1080p60');
		await vi.waitFor(() => expect(localParticipant.publishTrack).toHaveBeenCalledTimes(1));
		await voiceState.stopScreenShare();
		finish();
		await quality;

		expect(localParticipant.getTrackPublication('screen_share')).toBeUndefined();
		expect(localParticipant.publishTrack).toHaveBeenCalledTimes(1);
	});
});
