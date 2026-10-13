import { EventEmitter } from 'node:events';
import { AxiosError } from 'axios';
import { DisconnectReason } from 'livekit-client';
import { toast } from 'svelte-sonner';
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

vi.mock('$lib/requests/calls/refreshCall', () => ({
	refreshCall: vi.fn(),
	refreshCallOnUnload: vi.fn()
}));

vi.mock('$lib/requests/calls/getCallToken', () => ({ getCallToken: vi.fn() }));

vi.mock('svelte-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { axiosClient } from '$lib/requests/axiosClient';
import { getCallToken } from '$lib/requests/calls/getCallToken';
import { refreshCall, refreshCallOnUnload } from '$lib/requests/calls/refreshCall';
import {
	refreshVoicePresence,
	refreshVoicePresenceOnUnload
} from '$lib/requests/voice/refreshVoicePresence';
import { voiceState, type VoiceTarget } from './voiceState.svelte';
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

const CHANNEL = { channelId: 5, serverId: 1 };
const CALL = { callId: 9, callConversationId: 3 };
const callTarget: VoiceTarget = { kind: 'call', callId: 9, conversationId: 3 };
const channelTarget: VoiceTarget = { kind: 'channel', serverId: 1, channelId: 5 };

type Internals = {
	connect: (target: VoiceTarget, gen: number) => Promise<void>;
	rejoin: (target: VoiceTarget) => Promise<void>;
	handleDisconnected: (room: unknown, reason?: DisconnectReason) => void;
	onPageHide: () => void;
	fetchToken: (target: VoiceTarget) => Promise<unknown>;
	cleanup: () => void;
};
const internals = () => voiceState as unknown as Internals;

function failure(status: number) {
	return new AxiosError('failed', undefined, undefined, undefined, {
		status,
		data: {},
		headers: {},
		statusText: '',
		config: {} as never
	});
}

describe('voiceState call target', () => {
	afterEach(() => {
		internals().cleanup();
		vi.restoreAllMocks();
		vi.useRealTimers();
		vi.clearAllMocks();
		usersState.loggedInUser = null;
	});

	function signedIn() {
		usersState.loggedInUser = { id: 1 } as typeof usersState.loggedInUser;
	}

	it.each([
		{ kind: 'channel', fields: CHANNEL, refresh: refreshVoicePresence, id: 5 },
		{ kind: 'call', fields: CALL, refresh: refreshCall, id: 9 }
	])('leaving a $kind refreshes its target and clears every target field', async (c) => {
		const { room } = fakeRoom(async () => {});
		Object.assign(voiceState, { room, ...c.fields });

		await voiceState.leaveVoice();

		expect(c.refresh).toHaveBeenCalledWith(c.id);
		expect(voiceState.target).toBeNull();
		expect([
			voiceState.channelId,
			voiceState.serverId,
			voiceState.callId,
			voiceState.callConversationId
		]).toEqual([null, null, null, null]);
	});

	it.each([
		{
			from: 'channel',
			to: 'call',
			fields: CHANNEL,
			refreshed: refreshVoicePresence,
			join: () => voiceState.joinCall({ id: 9, conversation_id: 3 }),
			target: callTarget,
			now: { channelId: null, callId: 9 }
		},
		{
			from: 'call',
			to: 'channel',
			fields: CALL,
			refreshed: refreshCall,
			join: () => voiceState.joinVoice(1, 5),
			target: channelTarget,
			now: { channelId: 5, callId: null }
		}
	])(
		'joining a $to from a $from leaves the old room first and sets only the new target',
		async (c) => {
			signedIn();
			const { room } = fakeRoom(async () => {});
			Object.assign(voiceState, { room, ...c.fields });
			const connect = vi.spyOn(internals(), 'connect').mockResolvedValue();

			await c.join();

			expect(room.disconnect).toHaveBeenCalledOnce();
			expect(c.refreshed).toHaveBeenCalledOnce();
			expect(connect).toHaveBeenCalledWith(c.target, expect.any(Number));
			expect({ channelId: voiceState.channelId, callId: voiceState.callId }).toEqual(c.now);
		}
	);

	it('does nothing when joining the call it is already in', async () => {
		signedIn();
		const { room } = fakeRoom(async () => {});
		Object.assign(voiceState, { room, ...CALL });
		const connect = vi.spyOn(internals(), 'connect').mockResolvedValue();

		await voiceState.joinCall({ id: 9, conversation_id: 3 });

		expect(connect).not.toHaveBeenCalled();
		expect(room.disconnect).not.toHaveBeenCalled();
	});

	it.each([
		{
			name: 'a deleted channel room',
			reason: DisconnectReason.ROOM_DELETED,
			fields: CHANNEL,
			toasted: 'The voice channel was closed.'
		},
		{
			name: 'a deleted call room',
			reason: DisconnectReason.ROOM_DELETED,
			fields: CALL,
			toasted: null
		},
		{
			name: 'a closed call room',
			reason: DisconnectReason.ROOM_CLOSED,
			fields: CALL,
			toasted: null
		},
		{
			name: 'being removed from a call',
			reason: DisconnectReason.PARTICIPANT_REMOVED,
			fields: CALL,
			toasted: 'You joined voice somewhere else.'
		},
		{
			name: 'a duplicate identity in a channel',
			reason: DisconnectReason.DUPLICATE_IDENTITY,
			fields: CHANNEL,
			toasted: 'You joined voice somewhere else.'
		}
	])('$name toasts $toasted and does not rejoin', (c) => {
		const { room } = fakeRoom(async () => {});
		Object.assign(voiceState, { room, ...c.fields });
		const rejoin = vi.spyOn(internals(), 'rejoin').mockResolvedValue();

		internals().handleDisconnected(room, c.reason);

		expect(rejoin).not.toHaveBeenCalled();
		expect(voiceState.target).toBeNull();
		if (c.toasted) expect(toast).toHaveBeenCalledWith(c.toasted);
		else expect(toast).not.toHaveBeenCalled();
	});

	it('rejoins the same call after an unexpected disconnect', () => {
		const { room } = fakeRoom(async () => {});
		Object.assign(voiceState, { room, ...CALL });
		const rejoin = vi.spyOn(internals(), 'rejoin').mockResolvedValue();

		internals().handleDisconnected(room, DisconnectReason.SERVER_SHUTDOWN);

		expect(rejoin).toHaveBeenCalledWith(callTarget);
	});

	it.each([
		{ target: callTarget, fields: CALL, status: 409, tries: 1, lost: false },
		{ target: callTarget, fields: CALL, status: 500, tries: 3, lost: true },
		{ target: channelTarget, fields: CHANNEL, status: 409, tries: 3, lost: true }
	])('rejoining a $target.kind after a $status tries $tries times and toasts: $lost', async (c) => {
		vi.useFakeTimers();
		Object.assign(voiceState, c.fields);
		const connect = vi.spyOn(internals(), 'connect').mockRejectedValue(failure(c.status));
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		const rejoining = internals().rejoin(c.target);
		await vi.advanceTimersByTimeAsync(20_000);
		await rejoining;

		expect(connect).toHaveBeenCalledTimes(c.tries);
		expect(voiceState.target).toBeNull();
		if (c.lost) {
			expect(toast.error).toHaveBeenCalledWith(
				"Lost connection to voice. Join again when you're back online."
			);
		} else {
			expect(toast.error).not.toHaveBeenCalled();
		}
	});

	it('rejoining a call connects to the same call and keeps it', async () => {
		vi.useFakeTimers();
		Object.assign(voiceState, CALL);
		const connect = vi.spyOn(internals(), 'connect').mockResolvedValue();

		const rejoining = internals().rejoin(callTarget);
		await vi.advanceTimersByTimeAsync(1_000);
		await rejoining;

		expect(connect).toHaveBeenCalledWith(callTarget, expect.any(Number));
		expect(voiceState.callId).toBe(9);
	});

	it.each([
		{ name: 'the call it is in', fields: CALL, id: 9, leaves: true },
		{ name: 'another call', fields: CALL, id: 10, leaves: false },
		{ name: 'a channel', fields: CHANNEL, id: 9, leaves: false }
	])('ending $name with id $id leaves: $leaves', async (c) => {
		const { room } = fakeRoom(async () => {});
		Object.assign(voiceState, { room, ...c.fields });

		await voiceState.endCall(c.id);

		expect(room.disconnect).toHaveBeenCalledTimes(c.leaves ? 1 : 0);
		expect(voiceState.target === null).toBe(c.leaves);
	});

	it('stops a rejoin loop when the call ends', async () => {
		vi.useFakeTimers();
		Object.assign(voiceState, CALL);
		const connect = vi.spyOn(internals(), 'connect').mockResolvedValue();

		const rejoining = internals().rejoin(callTarget);
		await voiceState.endCall(9);
		await vi.advanceTimersByTimeAsync(20_000);
		await rejoining;

		expect(connect).not.toHaveBeenCalled();
		expect(voiceState.callId).toBeNull();
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('leaves the newer join alone when a superseded join fails late', async () => {
		signedIn();
		let failFirst!: (err: unknown) => void;
		vi.spyOn(internals(), 'connect')
			.mockImplementationOnce(() => new Promise((_resolve, reject) => (failFirst = reject)))
			.mockResolvedValue();
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		const first = voiceState.joinVoice(1, 6);
		await voiceState.joinCall({ id: 9, conversation_id: 3 });
		failFirst(failure(500));
		await first;

		expect(toast.error).not.toHaveBeenCalled();
		expect(voiceState.target).toEqual(callTarget);
	});

	it.each([
		{ kind: 'channel', fields: CHANNEL, beacon: refreshVoicePresenceOnUnload, id: 5 },
		{ kind: 'call', fields: CALL, beacon: refreshCallOnUnload, id: 9 }
	])('hiding the page disconnects and sends a beacon for the $kind', (c) => {
		const { room } = fakeRoom(async () => {});
		Object.assign(voiceState, { room, ...c.fields });

		internals().onPageHide();

		expect(room.disconnect).toHaveBeenCalledOnce();
		expect(c.beacon).toHaveBeenCalledWith(c.id);
	});

	it.each([
		{
			kind: 'channel',
			target: channelTarget,
			asked: () =>
				expect(axiosClient.post).toHaveBeenCalledWith('/api/voice/token', { channel_id: 5 })
		},
		{
			kind: 'call',
			target: callTarget,
			asked: () => expect(getCallToken).toHaveBeenCalledWith(9)
		}
	])('asks the $kind token endpoint', async (c) => {
		vi.spyOn(axiosClient, 'post').mockResolvedValue({ data: { token: 't', url: 'u' } });
		vi.mocked(getCallToken).mockResolvedValue({ token: 't', url: 'u', room: 'r' });

		await expect(internals().fetchToken(c.target)).resolves.toMatchObject({ token: 't' });

		c.asked();
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
