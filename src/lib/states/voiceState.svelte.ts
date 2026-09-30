import {
	DisconnectReason,
	LocalAudioTrack,
	Room,
	RoomEvent,
	Track,
	type RemoteTrack,
	type RemoteParticipant,
	type Participant,
	type RemoteVideoTrack,
	type VideoPreset,
	type LocalVideoTrack,
	type TrackPublication
} from 'livekit-client';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { toast } from 'svelte-sonner';
import { usersState } from './usersState.svelte';
import { serversState } from './serversState.svelte';
import { DEFAULT_DEVICE, voiceSettingsState } from './voiceSettingsState.svelte';
import { axiosClient } from '$lib/requests/axiosClient';
import {
	refreshVoicePresence,
	refreshVoicePresenceOnUnload
} from '$lib/requests/voice/refreshVoicePresence';
import {
	InsecureContextError,
	classifyMicError,
	describeVoiceError,
	type MicIssue
} from '$lib/utils/voiceErrors';
import {
	SCREEN_PRESETS,
	SCREEN_PUBLISH,
	isPickerCancel,
	type ScreenContent,
	type ScreenPresetId
} from '$lib/utils/screenShare';

export interface VoicePeer {
	id: string;
	username: string;
	profile: any;
	isSpeaking: boolean;
	/** No live mic: muted, deafened, or never published one. */
	muted: boolean;
	deafened: boolean;
	streaming: boolean;
}

export interface ScreenStream {
	/** Participant identity + ':screen'. */
	id: string;
	identity: string;
	username: string;
	local: boolean;
	track: RemoteVideoTrack | LocalVideoTrack;
	/** What the browser is capturing. Only known for your own share. */
	surface?: 'monitor' | 'window' | 'browser';
}

/** Participant attribute other clients read to show someone as deafened. */
const DEAFENED_ATTR = 'deafened';
const STORAGE_KEY = 'voice.selfState';
const REJOIN_DELAYS_MS = [1000, 3000, 10000];

function loadSelfState(): { muted: boolean; deafened: boolean } {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return { muted: parsed.muted === true, deafened: parsed.deafened === true };
		}
	} catch {
		/* unavailable or malformed: fall back to defaults */
	}
	return { muted: false, deafened: false };
}

class VoiceState {
	channelId: number | null = $state(null);
	/** The call's server and channel name, kept for when another server is open. */
	serverId: number | null = $state(null);
	channelName: string | null = $state(null);
	connected: boolean = $state(false);
	connecting: boolean = $state(false);
	/** LiveKit is recovering the connection, or a rejoin is in progress. */
	reconnecting: boolean = $state(false);
	/** The user's own mute choice. It survives deafening and leaving voice. */
	muted: boolean = $state(false);
	deafened: boolean = $state(false);
	/** What the mic button shows: deafening always silences the mic too. */
	readonly micOff: boolean = $derived(this.muted || this.deafened);
	/** Why the mic isn't live although the user wants it. Not saved: the next join asks again. */
	micError: MicIssue | null = $state(null);
	/** The in-app explainer shown before the browser's own microphone prompt. */
	micPrompt: { resolve: (allow: boolean) => void } | null = $state(null);
	// participant identity (user id) -> VoicePeer
	peers: SvelteMap<string, VoicePeer> = $state(new SvelteMap());
	/** The user's own screen share is live. */
	sharing: boolean = $state(false);
	// participant identity -> their screen share video
	screens: SvelteMap<string, ScreenStream> = $state(new SvelteMap());
	/** Identities LiveKit reported gone since they last connected to this room. */
	departed: SvelteSet<string> = $state(new SvelteSet());
	/** The user chose to see their own share even though it may mirror into itself. */
	selfPreview: boolean = $state(false);

	private room: Room | null = null;
	// One <audio> element per remote track, attached to the DOM so it plays.
	private audioEls = new Map<string, HTMLAudioElement>();
	private leaving = false;
	// Bumped by every join, rejoin and leave so superseded async work can tell.
	private generation = 0;
	// The saved device is unplugged and the call is on the default one instead.
	private fallback = { audioinput: false, audiooutput: false };
	private micWatch: { status: PermissionStatus; onChange: () => void } | null = null;
	// Bumped whenever the permission listener is replaced or removed.
	private micWatchSeq = 0;

	private parseProfile(p: Participant): any {
		// We stash the user's profile JSON in participant metadata when we can;
		// fall back to empty. Username comes from participant.name.
		if (!p.metadata) return {};
		try {
			return JSON.parse(p.metadata);
		} catch {
			return {};
		}
	}

	constructor() {
		if (typeof window !== 'undefined') {
			const saved = loadSelfState();
			this.muted = saved.muted;
			this.deafened = saved.deafened;

			// Fire-and-forget: just enough for others' voice lists to update quickly.
			window.addEventListener('pagehide', () => {
				if (this.room) {
					this.leaving = true;
					this.room.disconnect();
					if (this.channelId != null) refreshVoicePresenceOnUnload(this.channelId);
				}
			});
		}
	}

	private persistSelfState() {
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ muted: this.muted, deafened: this.deafened })
			);
		} catch {
			/* storage blocked: the choice just won't survive a reload */
		}
	}

	private upsertPeer(p: Participant) {
		const isSelf = this.room?.localParticipant.identity === p.identity;
		this.peers.set(p.identity, {
			id: p.identity,
			username: (p.name || 'Unknown') + (isSelf ? ' (You)' : ''),
			profile: this.parseProfile(p),
			isSpeaking: p.isSpeaking,
			muted: !p.isMicrophoneEnabled,
			deafened: p.attributes?.[DEAFENED_ATTR] === 'true',
			streaming: p.isScreenShareEnabled
		});
	}

	private setScreen(p: Participant, track: RemoteVideoTrack | LocalVideoTrack) {
		const local = p.identity === this.room?.localParticipant.identity;
		this.screens.set(p.identity, {
			id: `${p.identity}:screen`,
			identity: p.identity,
			username: p.name || 'Unknown',
			local,
			track,
			surface: local ? this.captureSurface(track) : undefined
		});
	}

	private captureSurface(track: RemoteVideoTrack | LocalVideoTrack): ScreenStream['surface'] {
		const surface = track.mediaStreamTrack.getSettings().displaySurface;
		return surface === 'monitor' || surface === 'window' || surface === 'browser'
			? surface
			: undefined;
	}

	/** Your own share might be capturing the screen it's shown on. Some platforms
	 *  (e.g. the Wayland portal) don't report the surface, so unknown counts too. */
	mirrorsSelf(stream: ScreenStream): boolean {
		return stream.local && stream.surface !== 'window' && stream.surface !== 'browser';
	}

	previewHidden(stream: ScreenStream): boolean {
		return this.mirrorsSelf(stream) && !this.selfPreview;
	}

	private applyQueue: Promise<void> = Promise.resolve();
	/** Last deafen value sent to the room. The participant's own attributes
	 *  only change once the server echoes them, so they can't be compared. */
	private sharedDeafened: boolean | null = null;

	/** Bring the room in line with muted/deafened. Calls run one at a time and
	 *  each applies the latest state, so fast toggles can't interleave. */
	private applySelfState(): Promise<void> {
		const run = this.applyQueue.then(() => this.applySelfStateNow());
		this.applyQueue = run.catch(() => {});
		return run;
	}

	private async applySelfStateNow() {
		const room = this.room;
		if (!room) return;

		this.audioEls.forEach((el) => (el.muted = this.deafened));

		// Only publishes a mic when it should be live, so joining muted never opens one,
		// and a mic that already failed isn't retried until the user asks.
		let changed = false;
		const micOn = !this.micOff && !this.micError;
		if (micOn !== room.localParticipant.isMicrophoneEnabled) {
			await room.localParticipant.setMicrophoneEnabled(micOn);
			changed = true;
		}

		const deafened = this.deafened;
		if (this.sharedDeafened !== deafened) {
			try {
				await room.localParticipant.setAttributes({ [DEAFENED_ATTR]: String(deafened) });
				this.sharedDeafened = deafened;
				changed = true;
			} catch (err) {
				// Only affects what others see; local deafen still works.
				console.warn('Could not share deafen state:', err);
			}
		}
		if (changed) this.announce(room);
		this.upsertPeer(room.localParticipant);
	}

	private setMicError(issue: MicIssue | null) {
		this.micError = issue;
		this.unwatchMic();
		if (issue && this.room) void this.watchMic();
	}

	/** Try to go live again. When permission was never given, this is what makes the browser
	 *  ask; a failure sets the error again through setSelfState. */
	async retryMic() {
		this.setMicError(null);
		await this.setSelfState({ muted: false, deafened: false });
	}

	private async micPermission(): Promise<PermissionStatus | null> {
		try {
			return (await navigator.permissions?.query({ name: 'microphone' as PermissionName })) ?? null;
		} catch {
			return null;
		}
	}

	/** Retry on its own once the user allows the mic in the browser's settings. */
	private async watchMic() {
		this.unwatchMic();
		if (this.micError !== 'blocked' && this.micError !== 'off') return;
		const seq = this.micWatchSeq;
		const gen = this.generation;
		const status = await this.micPermission();
		if (!status || seq !== this.micWatchSeq) return;
		const onChange = () => {
			if (status.state === 'granted' && gen === this.generation && this.room) void this.retryMic();
		};
		status.addEventListener('change', onChange);
		this.micWatch = { status, onChange };
	}

	private unwatchMic() {
		this.micWatchSeq++;
		this.micWatch?.status.removeEventListener('change', this.micWatch.onChange);
		this.micWatch = null;
	}

	/** Explain why the mic is needed before the browser asks. Resolves true to go ahead. */
	private askForMic(): Promise<boolean> {
		this.micPrompt?.resolve(false);
		return new Promise((resolve) => {
			this.micPrompt = {
				resolve: (allow) => {
					this.micPrompt = null;
					resolve(allow);
				}
			};
		});
	}

	/** Let members outside the call see a change to this room now. */
	private announce(room: Room) {
		if (room === this.room && this.channelId != null) refreshVoicePresence(this.channelId);
	}

	private removePeer(identity: string) {
		this.peers.delete(identity);
	}

	private attachTrack(track: RemoteTrack) {
		if (track.kind !== Track.Kind.Audio) return; // audio-only for now
		const el = track.attach() as HTMLAudioElement;
		el.autoplay = true;
		el.muted = this.deafened; // respect deafen for tracks that arrive later
		document.body.appendChild(el);
		this.audioEls.set(track.sid ?? Math.random().toString(36), el);
	}

	private detachTrack(track: RemoteTrack) {
		track.detach().forEach((el) => el.remove());
		if (track.sid) this.audioEls.delete(track.sid);
	}

	private wireRoom(r: Room, gen: number) {
		const refresh = (_pub: TrackPublication, p: Participant) => this.upsertPeer(p);
		r.on(RoomEvent.TrackMuted, refresh)
			.on(RoomEvent.TrackUnmuted, refresh)
			.on(RoomEvent.TrackPublished, (pub, p) => this.upsertPeer(p))
			.on(RoomEvent.TrackUnpublished, (pub, p) => this.upsertPeer(p))
			.on(RoomEvent.LocalTrackPublished, (pub, p) => {
				this.upsertPeer(p);
				if (pub.source !== Track.Source.ScreenShare || gen !== this.generation) return;
				if (pub.track?.kind === Track.Kind.Video) {
					this.sharing = true;
					this.selfPreview = false;
					this.setScreen(p, pub.track as LocalVideoTrack);
				}
			})
			.on(RoomEvent.LocalTrackUnpublished, (pub, p) => {
				this.upsertPeer(p);
				if (pub.source !== Track.Source.ScreenShare || gen !== this.generation) return;
				if (pub.kind === Track.Kind.Video) {
					this.sharing = false;
					this.screens.delete(p.identity);
				}
			})
			.on(RoomEvent.ParticipantAttributesChanged, (_changed, p) => this.upsertPeer(p));

		// Existing tracks are subscribed during room.connect(), before this.room is set,
		// so screen handlers gate on the attempt's generation instead.
		r.on(
			RoomEvent.TrackSubscribed,
			(track: RemoteTrack, pub: TrackPublication, p: RemoteParticipant) => {
				if (track.source === Track.Source.ScreenShare && track.kind === Track.Kind.Video) {
					if (gen === this.generation) this.setScreen(p, track as RemoteVideoTrack);
					return;
				}
				this.attachTrack(track);
			}
		)
			.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: TrackPublication, p) => {
				if (track.source === Track.Source.ScreenShare && track.kind === Track.Kind.Video) {
					if (this.screens.get(p.identity)?.track === track) this.screens.delete(p.identity);
					return;
				}
				this.detachTrack(track);
			})
			.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
				this.departed.delete(p.identity);
				this.upsertPeer(p);
			})
			.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
				this.removePeer(p.identity);
				this.departed.add(p.identity);
				this.screens.delete(p.identity);
			})
			.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
				const speaking = new Set(speakers.map((p) => p.identity));
				for (const [id, peer] of this.peers) {
					const isSpeaking = speaking.has(id);
					if (peer.isSpeaking !== isSpeaking) this.peers.set(id, { ...peer, isSpeaking });
				}
			})
			.on(RoomEvent.Reconnecting, () => {
				this.reconnecting = true;
			})
			.on(RoomEvent.SignalReconnecting, () => {
				this.reconnecting = true;
			})
			.on(RoomEvent.Reconnected, () => {
				this.reconnecting = false;
			})
			.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
				this.handleDisconnected(r, reason);
			})
			.on(RoomEvent.MediaDevicesChanged, () => this.checkDevices(r, true))
			.once(RoomEvent.Connected, () => this.checkDevices(r, false));
	}

	/** Move off a saved device that was unplugged, and back once it returns. */
	private async checkDevices(room: Room, announce: boolean) {
		try {
			await voiceSettingsState.refreshDevices();
		} catch {
			return;
		}
		if (room.state !== 'connected') return;

		const kinds = [
			['audioinput', voiceSettingsState.inputId, 'microphone'],
			['audiooutput', voiceSettingsState.outputId, 'audio output']
		] as const;
		for (const [kind, saved, name] of kinds) {
			if (kind === 'audiooutput' && !voiceSettingsState.outputSupported) continue;
			const missing = !voiceSettingsState.isAvailable(kind, saved);
			if (missing === this.fallback[kind]) continue;
			this.fallback[kind] = missing;
			if (missing) {
				await room.switchActiveDevice(kind, DEFAULT_DEVICE).catch(() => {});
				if (announce) toast(`Your ${name} was disconnected. Using the default one.`);
			} else {
				await room.switchActiveDevice(kind, saved).catch(() => {});
			}
		}
	}

	/** The published mic, for a level meter. Undefined when not in a call. */
	get micTrack(): MediaStreamTrack | undefined {
		return this.room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track
			?.mediaStreamTrack;
	}

	private get localScreenTrack(): LocalVideoTrack | undefined {
		const track = this.room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track;
		return track as LocalVideoTrack | undefined;
	}

	async startScreenShare() {
		const room = this.room;
		if (!room || this.sharing) return;
		const { preset } = SCREEN_PRESETS[voiceSettingsState.screenPreset];
		try {
			const pub = await room.localParticipant.setScreenShareEnabled(
				true,
				{
					audio: true,
					resolution: preset.resolution,
					contentHint: voiceSettingsState.screenContent,
					selfBrowserSurface: 'exclude',
					surfaceSwitching: 'include',
					systemAudio: 'include',
					suppressLocalAudioPlayback: true
				},
				{
					screenShareEncoding: SCREEN_PUBLISH.encoding,
					screenShareSimulcastLayers: SCREEN_PUBLISH.layers,
					simulcast: true
				}
			);
			if (pub?.track) await this.limitTopLayer(pub.track as LocalVideoTrack, preset);
		} catch (err) {
			if (isPickerCancel(err)) return;
			console.warn('Screen share failed:', err);
			toast.error(`Couldn't start screen share${err instanceof Error ? `: ${err.message}` : '.'}`);
		}
	}

	async stopScreenShare() {
		try {
			await this.room?.localParticipant.setScreenShareEnabled(false);
		} catch {
			/* nothing left to stop */
		}
	}

	/** Cap the highest simulcast layer at the preset's bitrate and frame rate. */
	private async limitTopLayer(track: LocalVideoTrack, preset: VideoPreset) {
		const sender = track.sender;
		if (!sender) return;
		const params = sender.getParameters();
		// With simulcast the encodings run low to high, so the top layer has the largest bitrate.
		const top = params.encodings.reduce((a, b) =>
			(b.maxBitrate ?? 0) > (a.maxBitrate ?? 0) ? b : a
		);
		top.maxBitrate = preset.encoding.maxBitrate;
		top.maxFramerate = preset.encoding.maxFramerate;
		await sender.setParameters(params);
	}

	async setScreenQuality(id: ScreenPresetId) {
		voiceSettingsState.save({ screenPreset: id });
		const track = this.localScreenTrack;
		if (!track) return;
		const { preset } = SCREEN_PRESETS[id];
		try {
			await track.mediaStreamTrack.applyConstraints({
				width: { ideal: preset.width },
				height: { ideal: preset.height },
				frameRate: { ideal: preset.encoding.maxFramerate }
			});
			await this.limitTopLayer(track, preset);
		} catch (err) {
			console.warn('Could not change screen share quality:', err);
			toast('Quality applies next time you share.');
		}
	}

	setScreenContent(content: ScreenContent) {
		voiceSettingsState.save({ screenContent: content });
		const track = this.localScreenTrack;
		if (track) track.mediaStreamTrack.contentHint = content;
	}

	async setInputDevice(deviceId: string) {
		voiceSettingsState.save({ inputId: deviceId });
		this.fallback.audioinput = false;
		await this.room?.switchActiveDevice('audioinput', deviceId);
	}

	async setOutputDevice(deviceId: string) {
		voiceSettingsState.save({ outputId: deviceId });
		this.fallback.audiooutput = false;
		await this.room?.switchActiveDevice('audiooutput', deviceId);
	}

	async setAudioProcessing(next: { noiseSuppression?: boolean; echoCancellation?: boolean }) {
		voiceSettingsState.save(next);
		const room = this.room;
		if (!room) return;
		const capture = voiceSettingsState.captureOptions();
		// Shared with the local participant, so a mic published later uses it too.
		Object.assign(room.options.audioCaptureDefaults ?? {}, capture, {
			deviceId: room.getActiveDevice('audioinput') ?? capture.deviceId
		});
		const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
		if (track instanceof LocalAudioTrack) {
			await track.restartTrack({ ...room.options.audioCaptureDefaults });
		}
	}

	private handleDisconnected(r: Room, reason?: DisconnectReason) {
		if (r !== this.room) return;
		const channelId = this.channelId;

		if (this.leaving || reason === DisconnectReason.CLIENT_INITIATED) {
			this.cleanup();
		} else if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
			this.cleanup();
			toast('You joined voice from another tab or device.');
		} else if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
			this.cleanup();
			toast.error('You were removed from the voice channel.');
		} else if (
			reason === DisconnectReason.ROOM_DELETED ||
			reason === DisconnectReason.ROOM_CLOSED
		) {
			this.cleanup();
			toast('The voice channel was closed.');
		} else if (channelId == null) {
			this.cleanup();
		} else {
			this.rejoin(channelId);
		}
	}

	/** Audio and peers of the current room; keeps the channel and the user's mute choice. */
	private resetRoom() {
		this.audioEls.forEach((el) => {
			el.pause();
			el.srcObject = null;
			el.remove();
		});
		this.audioEls.clear();
		this.room = null;
		this.sharedDeafened = null;
		this.fallback = { audioinput: false, audiooutput: false };
		this.peers = new SvelteMap();
		this.screens = new SvelteMap();
		this.departed = new SvelteSet();
		this.sharing = false;
		this.selfPreview = false;
	}

	private cleanup() {
		this.micPrompt?.resolve(false);
		this.setMicError(null);
		this.resetRoom();
		this.channelId = null;
		this.serverId = null;
		this.channelName = null;
		this.connected = false;
		this.connecting = false;
		this.reconnecting = false;
		this.leaving = false;
	}

	private async dropRoom(room: Room, channelId: number) {
		// Detached first, so its Disconnected event is seen as stale.
		if (this.room === room) this.room = null;
		try {
			await room.disconnect();
		} catch {
			/* ignore */
		}
		refreshVoicePresence(channelId);
	}

	private async rejoin(channelId: number) {
		const gen = ++this.generation;
		if (this.sharing) toast('Screen share stopped when the connection dropped.');
		this.resetRoom();
		this.connected = false;
		this.connecting = false;
		this.reconnecting = true;

		for (const delay of REJOIN_DELAYS_MS) {
			await new Promise((resolve) => setTimeout(resolve, delay));
			if (gen !== this.generation) return;
			try {
				await this.connect(channelId, gen);
				return;
			} catch (err) {
				console.warn('Voice rejoin failed:', err);
			}
		}

		if (gen !== this.generation) return;
		this.cleanup();
		toast.error("Lost connection to voice. Join again when you're back online.");
	}

	private async setSelfState(next: { muted: boolean; deafened: boolean }) {
		const prev = { muted: this.muted, deafened: this.deafened };
		this.muted = next.muted;
		this.deafened = next.deafened;
		// Saved before the room round-trip, so closing the tab right after a
		// toggle still keeps it.
		this.persistSelfState();
		try {
			await this.applySelfState();
		} catch (err) {
			console.error('Failed to update microphone:', err);
			if (!next.muted && !next.deafened) {
				// The user wants to talk, so keep that choice and let the dock explain what's wrong.
				this.setMicError(classifyMicError(err));
			} else {
				this.muted = prev.muted;
				this.deafened = prev.deafened;
				this.persistSelfState();
			}
			await this.applySelfState().catch(() => {});
		}
	}

	/** Toggle the mic. Unmuting while deafened also undeafens, since a live mic
	 *  you can't hear back through is never what was meant. */
	async toggleMute() {
		if (this.micError) {
			await this.retryMic();
		} else if (this.deafened) {
			await this.setSelfState({ muted: false, deafened: false });
		} else {
			await this.setSelfState({ muted: !this.muted, deafened: false });
		}
	}

	/** Toggle deafen. The mic goes quiet while deafened; undeafening returns it
	 *  to the user's own mute choice. */
	async toggleDeafen() {
		await this.setSelfState({ muted: this.muted, deafened: !this.deafened });
	}

	async joinVoice(channelId: number) {
		const user = usersState.loggedInUser;
		const serverId = serversState.selectedServer?.id;
		if (!user || !serverId) return;

		// Already connected somewhere: leave first. Leaving bumps the generation,
		// so this attempt's own is taken afterwards.
		if (this.room) await this.leaveVoice();
		const gen = ++this.generation;

		this.connecting = true;
		this.reconnecting = false;
		this.channelId = channelId;
		this.serverId = serverId;
		this.channelName = serversState.selectedServerChannels[channelId]?.name ?? null;

		try {
			await this.connect(channelId, gen);
		} catch (err) {
			console.warn('Error joining voice:', err);
			toast.error(describeVoiceError(err));
			this.cleanup();
		}
	}

	/** A stale attempt (gen no longer current) bails out quietly without touching state. */
	private async connect(channelId: number, gen: number) {
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			throw new InsecureContextError();
		}
		const fresh = !this.reconnecting;

		// 0. On a fresh join, explain the mic prompt first. A rejoin never asks again.
		if (fresh) {
			this.setMicError(null);
			if (!this.micOff && (await this.micPermission())?.state === 'prompt') {
				const allow = await this.askForMic();
				if (gen !== this.generation) return;
				if (!allow) this.micError = 'off';
			}
		}

		// 1. Get a LiveKit token from ping-server (membership checked there).
		const { token, url } = await axiosClient
			.post('/api/voice/token', { channel_id: channelId })
			.then((r) => r.data);
		if (gen !== this.generation) return;

		// 2. Connect to LiveKit.
		const room = new Room({
			adaptiveStream: true,
			dynacast: true,
			...voiceSettingsState.roomOptions()
		});
		this.wireRoom(room, gen);
		// The server knows about us from here on, well before media is up.
		room.once(RoomEvent.SignalConnected, () => {
			if (gen === this.generation) refreshVoicePresence(channelId);
		});

		try {
			await room.connect(url, token);
			if (gen !== this.generation) return await this.dropRoom(room, channelId);
			// Only a connected room is current. A failed attempt emits Disconnected
			// before connect() rejects, and that must not count as a lost connection.
			this.room = room;

			// 3. Publish the mic unless the user left muted or deafened last time.
			// A mic that can't start leaves the user in the call, listen-only.
			try {
				await this.applySelfState();
			} catch (err) {
				if (gen !== this.generation) return await this.dropRoom(room, channelId);
				this.setMicError(classifyMicError(err));
				await this.applySelfState().catch(() => {});
			}
			if (gen !== this.generation) return await this.dropRoom(room, channelId);
			if (this.micError) void this.watchMic();

			// 4. Seed the peers map: self + everyone already in the room.
			this.upsertPeer(room.localParticipant);
			room.remoteParticipants.forEach((p) => {
				this.upsertPeer(p);
				// Existing tracks fire TrackSubscribed automatically on connect.
			});

			this.connected = true;
			this.connecting = false;
			this.reconnecting = false;

			if (fresh && this.deafened) toast("You're deafened");
			else if (fresh && this.muted) toast("You're muted");
		} catch (err) {
			await this.dropRoom(room, channelId);
			if (gen !== this.generation) return;
			throw err;
		}
	}

	/** Keep the call's channel name current, even while another server is open. */
	renameChannel(channelId: number, name: string) {
		if (channelId === this.channelId) this.channelName = name;
	}

	async leaveVoice() {
		this.leaving = true;
		this.generation++;
		const channelId = this.channelId;
		if (this.room) {
			try {
				await this.room.disconnect();
			} catch {
				/* ignore */
			}
			if (channelId != null) refreshVoicePresence(channelId);
		}
		this.cleanup();
	}
}

export const voiceState = new VoiceState();
