import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
import { usersState } from './usersState.svelte';
import { gameVoiceState } from './gameVoiceState.svelte';
import { voicePeerAudioState } from './voicePeerAudioState.svelte';

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

describe('voiceState game volume', () => {
	const CHANNEL = 9;

	function inCallWith(...ids: number[]) {
		const volumes = new Map<number, number[]>();
		const remoteParticipants = new Map(
			ids.map((id) => [
				String(id),
				{
					identity: String(id),
					setVolume: (volume: number, source: string) => {
						if (source === 'microphone') volumes.set(id, [...(volumes.get(id) ?? []), volume]);
					}
				}
			])
		);
		Object.assign(voiceState, { room: { remoteParticipants }, channelId: CHANNEL });
		usersState.loggedInUser = { id: 4 } as typeof usersState.loggedInUser;
		return (id: number) => volumes.get(id)?.at(-1);
	}

	const frame = (players: number[], hearSpectators = false) => ({
		server_id: 1,
		channel_id: CHANNEL,
		integration_id: 3,
		name: 'Minecraft',
		active: true,
		players_hear_spectators: hearSpectators,
		players: players.map((user_id) => ({ user_id, player_name: `p${user_id}` }))
	});

	afterEach(() => {
		gameVoiceState.reset();
		voicePeerAudioState.set(7, { volume: 1, muted: false });
		usersState.loggedInUser = null;
		Object.assign(voiceState, { room: null, channelId: null });
	});

	it('plays a player at their own volume times the game gain, and restores it when the game ends', () => {
		const volume = inCallWith(7, 99);
		voicePeerAudioState.set(7, { volume: 0.5 });

		gameVoiceState.applySession(frame([4, 7]));
		gameVoiceState.applyMix({ channel_id: CHANNEL, integration_id: 3, gains: { '7': 0.5 } });

		expect(volume(7)).toBe(0.25);
		expect(volume(99)).toBe(0);

		gameVoiceState.applyMix({ channel_id: CHANNEL, integration_id: 3, gains: { '7': 1 } });
		expect(volume(7)).toBe(0.5);

		gameVoiceState.applySession({ ...frame([]), active: false });
		expect(volume(7)).toBe(0.5);
		expect(volume(99)).toBe(1);
	});

	it('leaves a call in another channel alone', () => {
		const volume = inCallWith(7);

		gameVoiceState.applySession({ ...frame([4, 7]), channel_id: 12 });

		expect(volume(7)).toBeUndefined();
	});

	it('sets a new track to the game level right after its element exists', () => {
		const calls: string[] = [];
		const room = new EventEmitter();
		const participant = {
			identity: '7',
			setVolume: (volume: number, source: string) => calls.push(`${source}:${volume}`)
		};
		const track = {
			kind: 'audio',
			source: 'microphone',
			sid: 'TR_1',
			attach: () => {
				calls.push('attach');
				return {};
			}
		};
		vi.stubGlobal('document', { body: { appendChild: vi.fn() } });
		usersState.loggedInUser = { id: 4 } as typeof usersState.loggedInUser;
		Object.assign(voiceState, { channelId: CHANNEL });
		gameVoiceState.applySession(frame([4, 7]));
		calls.length = 0;

		(voiceState as unknown as { wireRoom: (r: unknown, gen: number) => void }).wireRoom(room, 0);
		room.emit('trackSubscribed', track, {}, participant);

		expect(calls.filter((c) => c !== 'screen_share_audio:1')).toEqual(['attach', 'microphone:0']);
		vi.unstubAllGlobals();
	});
});
