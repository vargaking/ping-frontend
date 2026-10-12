import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';

const senderStats = vi.hoisted(() => vi.fn(async () => []));

vi.mock('livekit-client', async (importOriginal) => ({
	...(await importOriginal<typeof import('livekit-client')>()),
	LocalVideoTrack: class {
		source = '';
		getSenderStats = senderStats;
		constructor(public mediaStreamTrack: MediaStreamTrack) {}
	}
}));

vi.mock('$lib/requests/voice/refreshVoicePresence', () => ({
	refreshVoicePresence: vi.fn(),
	refreshVoicePresenceOnUnload: vi.fn()
}));

import { voiceState } from './voiceState.svelte';
import { voiceSettingsState } from './voiceSettingsState.svelte';
import { usersState } from './usersState.svelte';

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

describe('voiceState.joinVoice self state', () => {
	function stubConnect() {
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value)
		});
		const seen: { muted: boolean; deafened: boolean; stored: string | null }[] = [];
		const spy = vi
			.spyOn(voiceState as unknown as { connect: () => Promise<void> }, 'connect')
			.mockImplementation(async () => {
				seen.push({
					muted: voiceState.muted,
					deafened: voiceState.deafened,
					stored: localStorage.getItem('voice.selfState')
				});
			});
		return { seen, spy };
	}

	function signedIn() {
		usersState.loggedInUser = { id: 1 } as typeof usersState.loggedInUser;
	}

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		usersState.loggedInUser = null;
	});

	it.each([
		{ saved: { muted: true, deafened: true }, options: { muted: false, deafened: false } },
		{ saved: { muted: false, deafened: false }, options: { muted: true, deafened: false } },
		{ saved: { muted: true, deafened: true }, options: { muted: true, deafened: false } }
	])(
		'applies and saves $options over $saved after leaving the previous call',
		async ({ saved, options }) => {
			signedIn();
			const { room } = fakeRoom(async () => {});
			Object.assign(voiceState, { room, channelId: 5, serverId: 1, ...saved });
			const { seen } = stubConnect();

			await voiceState.joinVoice(1, 6, options);

			expect(seen).toEqual([{ ...options, stored: JSON.stringify(options) }]);
			expect(voiceState.channelId).toBe(6);
			expect(room.disconnect).toHaveBeenCalledOnce();
		}
	);

	it('keeps the saved state when no options are given', async () => {
		signedIn();
		Object.assign(voiceState, { room: null, muted: true, deafened: true });
		const { seen } = stubConnect();

		await voiceState.joinVoice(1, 6);

		expect(seen).toEqual([expect.objectContaining({ muted: true, deafened: true })]);
	});
});

/** A live screen share whose republish waits until `finish` is called. */
function sharingRoom(captured: { width: number; height: number } = { width: 1920, height: 1080 }) {
	const mst = {
		contentHint: '',
		applyConstraints: vi.fn(async () => {}),
		getSettings: vi.fn(() => ({ ...captured, frameRate: 30 })),
		stop: vi.fn()
	};
	const captureStop = vi.fn();
	let publication: { track: unknown } | undefined = {
		track: { mediaStreamTrack: mst, getSenderStats: senderStats }
	};
	let finishPublish!: () => void;
	const localParticipant = {
		identity: 'me',
		trackPublications: new Map(),
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
		createScreenTracks: vi.fn(async () => [
			{
				kind: 'video',
				mediaStreamTrack: mst,
				stop: captureStop,
				waitForDimensions: async () => captured
			}
		]),
		setScreenShareEnabled: vi.fn(async () => {
			publication = undefined;
		})
	};
	return {
		room: { localParticipant, disconnect: vi.fn(async () => {}) },
		localParticipant,
		mst,
		captureStop,
		finish: () => finishPublish()
	};
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

const internals = voiceState as unknown as {
	generation: number;
	wireRoom(room: unknown, generation: number): void;
};

describe('voiceState screen share start', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		senderStats.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		internals.generation = 0;
		voiceState.sharing = false;
		voiceState.startingShare = false;
		voiceState.shareOutput = null;
	});

	it.each([
		{ preset: '1440p30', captured: { width: 3440, height: 1440 }, maxBitrate: 10_750_000 },
		{ preset: '1440p30', captured: { width: 1920, height: 1080 }, maxBitrate: 4_500_000 },
		{ preset: '1080p60', captured: { width: 2580, height: 1080 }, maxBitrate: 9_406_250 }
	] as const)(
		'publishes $preset from a $captured.width x $captured.height capture at $maxBitrate bps',
		async ({ preset, captured, maxBitrate }) => {
			voiceSettingsState.save({ screenPreset: preset, screenContent: 'detail' });
			const { room, localParticipant, mst } = sharingRoom(captured);
			localParticipant.publishTrack.mockImplementation(async () => {
				voiceState.sharing = true;
			});
			Object.assign(voiceState, { room });

			await voiceState.startScreenShare();

			expect(localParticipant.createScreenTracks).toHaveBeenCalledWith(
				expect.objectContaining({ resolution: { width: 0, height: 0 } })
			);
			expect(mst.applyConstraints).not.toHaveBeenCalled();
			expect(localParticipant.publishTrack.mock.calls[0][1]).toMatchObject({
				screenShareEncoding: { maxBitrate }
			});
			expect(voiceState.shareOutput).toMatchObject(captured);
			expect(voiceState.startingShare).toBe(false);
		}
	);

	it('scales a capture above the pixel ceiling down before publishing', async () => {
		voiceSettingsState.save({ screenPreset: '1440p30', screenContent: 'detail' });
		const { room, localParticipant, mst } = sharingRoom({ width: 5120, height: 1440 });
		mst.getSettings
			.mockReturnValueOnce({ width: 5120, height: 1440, frameRate: 30 })
			.mockReturnValue({ width: 4434, height: 1246, frameRate: 30 });
		localParticipant.publishTrack.mockImplementation(async () => {
			voiceState.sharing = true;
		});
		Object.assign(voiceState, { room });

		await voiceState.startScreenShare();

		expect(mst.applyConstraints).toHaveBeenCalledOnce();
		expect(localParticipant.publishTrack.mock.calls[0][1]).toMatchObject({
			screenShareEncoding: { maxBitrate: 11_989_505 }
		});
	});

	it('stops the capture when publishing fails', async () => {
		const { room, localParticipant, captureStop } = sharingRoom();
		localParticipant.publishTrack.mockRejectedValue(new Error('publish failed'));
		Object.assign(voiceState, { room });

		await voiceState.startScreenShare();

		expect(captureStop).toHaveBeenCalledOnce();
		expect(voiceState.startingShare).toBe(false);
		expect(voiceState.shareOutput).toBeNull();
	});

	it('ends quietly when the picker is dismissed', async () => {
		const { room, localParticipant } = sharingRoom();
		localParticipant.createScreenTracks.mockRejectedValue(
			new DOMException('dismissed', 'NotAllowedError')
		);
		Object.assign(voiceState, { room });

		await voiceState.startScreenShare();

		expect(localParticipant.publishTrack).not.toHaveBeenCalled();
		expect(voiceState.startingShare).toBe(false);
		expect(console.warn).not.toHaveBeenCalled();
	});

	it('drops a capture that finishes after the call changed', async () => {
		const { room, localParticipant, captureStop } = sharingRoom();
		const capture = localParticipant.createScreenTracks.getMockImplementation()!;
		localParticipant.createScreenTracks.mockImplementation(async () => {
			internals.generation = -1;
			return capture();
		});
		localParticipant.publishTrack.mockResolvedValue(undefined);
		Object.assign(voiceState, { room });

		await voiceState.startScreenShare();

		expect(captureStop).toHaveBeenCalledOnce();
		expect(localParticipant.publishTrack).not.toHaveBeenCalled();
		expect(voiceState.shareOutput).toBeNull();
	});
});

describe('voiceState screen share readout', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		senderStats.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		internals.generation = 0;
		voiceState.sharing = false;
		voiceState.startingShare = false;
		voiceState.shareOutput = null;
	});

	async function startSharing(captured?: { width: number; height: number }) {
		voiceSettingsState.save({ screenPreset: '1080p30', screenContent: 'detail' });
		const live = sharingRoom(captured);
		live.localParticipant.publishTrack.mockImplementationOnce(async () => {
			voiceState.sharing = true;
		});
		Object.assign(voiceState, { room: live.room });
		await voiceState.startScreenShare();
		return live;
	}

	it('refreshes from the sender stats while sharing', async () => {
		await startSharing();

		await vi.advanceTimersByTimeAsync(4000);

		expect(senderStats).toHaveBeenCalledTimes(2);
	});

	it('stops refreshing and clears the readout when the share is unpublished', async () => {
		await startSharing();
		const handlers = new Map<string, (...args: unknown[]) => void>();
		const emitter = {
			on: (event: string, handler: (...args: unknown[]) => void) => {
				handlers.set(event, handler);
				return emitter;
			},
			once: () => emitter
		};
		internals.wireRoom(emitter, internals.generation);
		const me = {
			identity: 'me',
			name: 'Me',
			attributes: {},
			getTrackPublication: () => undefined
		};

		handlers.get(RoomEvent.LocalTrackUnpublished)!({ source: 'screen_share', kind: 'video' }, me);

		expect(voiceState.shareOutput).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('stops refreshing and clears the readout when the call ends', async () => {
		await startSharing();

		await voiceState.leaveVoice();

		expect(voiceState.shareOutput).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('shows the new size after a republish and keeps a single timer', async () => {
		const { mst, finish, localParticipant } = await startSharing();
		mst.getSettings.mockReturnValue({ width: 2560, height: 1440, frameRate: 60 });

		const quality = voiceState.setScreenQuality('1440p60');
		await vi.waitFor(() => expect(localParticipant.publishTrack).toHaveBeenCalledTimes(2));
		finish();
		await quality;

		expect(voiceState.shareOutput).toMatchObject({ width: 2560, height: 1440, fps: 60 });
		expect(vi.getTimerCount()).toBe(1);
	});

	it('clears the readout when a republish fails', async () => {
		const { localParticipant } = await startSharing();
		localParticipant.publishTrack.mockRejectedValueOnce(new Error('publish failed'));

		await voiceState.setScreenQuality('1440p60');

		expect(voiceState.shareOutput).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});
});
