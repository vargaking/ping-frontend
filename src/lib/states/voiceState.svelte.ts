import {
	DisconnectReason,
	Room,
	RoomEvent,
	Track,
	type RemoteTrack,
	type RemoteParticipant,
	type Participant,
	type TrackPublication
} from 'livekit-client';
import { SvelteMap } from 'svelte/reactivity';
import { toast } from 'svelte-sonner';
import { usersState } from './usersState.svelte';
import { serversState } from './serversState.svelte';
import { axiosClient } from '$lib/requests/axiosClient';
import { InsecureContextError, describeMicError, describeVoiceError } from '$lib/utils/voiceErrors';

export interface VoicePeer {
	id: string;
	username: string;
	profile: any;
	isSpeaking: boolean;
	/** No live mic: muted, deafened, or never published one. */
	muted: boolean;
	deafened: boolean;
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
	connected: boolean = $state(false);
	connecting: boolean = $state(false);
	/** LiveKit is recovering the connection, or a rejoin is in progress. */
	reconnecting: boolean = $state(false);
	/** The user's own mute choice. It survives deafening and leaving voice. */
	muted: boolean = $state(false);
	deafened: boolean = $state(false);
	/** What the mic button shows: deafening always silences the mic too. */
	readonly micOff: boolean = $derived(this.muted || this.deafened);
	// participant identity (user id) -> VoicePeer
	peers: SvelteMap<string, VoicePeer> = $state(new SvelteMap());

	private room: Room | null = null;
	// One <audio> element per remote track, attached to the DOM so it plays.
	private audioEls = new Map<string, HTMLAudioElement>();
	private leaving = false;
	// Bumped by every join, rejoin and leave so superseded async work can tell.
	private generation = 0;

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
			deafened: p.attributes?.[DEAFENED_ATTR] === 'true'
		});
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

		// Only publishes a mic when it should be live, so joining muted never opens one.
		const micOn = !this.micOff;
		if (micOn !== room.localParticipant.isMicrophoneEnabled) {
			await room.localParticipant.setMicrophoneEnabled(micOn);
		}

		const deafened = this.deafened;
		if (this.sharedDeafened !== deafened) {
			try {
				await room.localParticipant.setAttributes({ [DEAFENED_ATTR]: String(deafened) });
				this.sharedDeafened = deafened;
			} catch (err) {
				// Only affects what others see; local deafen still works.
				console.warn('Could not share deafen state:', err);
			}
		}
		this.upsertPeer(room.localParticipant);
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

	private wireRoom(r: Room) {
		const refresh = (_pub: TrackPublication, p: Participant) => this.upsertPeer(p);
		r.on(RoomEvent.TrackMuted, refresh)
			.on(RoomEvent.TrackUnmuted, refresh)
			.on(RoomEvent.TrackPublished, (pub, p) => this.upsertPeer(p))
			.on(RoomEvent.TrackUnpublished, (pub, p) => this.upsertPeer(p))
			.on(RoomEvent.LocalTrackPublished, (pub, p) => this.upsertPeer(p))
			.on(RoomEvent.LocalTrackUnpublished, (pub, p) => this.upsertPeer(p))
			.on(RoomEvent.ParticipantAttributesChanged, (_changed, p) => this.upsertPeer(p));

		r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
			this.attachTrack(track);
		})
			.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
				this.detachTrack(track);
			})
			.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
				this.upsertPeer(p);
			})
			.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
				this.removePeer(p.identity);
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
			});
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
		this.peers = new SvelteMap();
	}

	private cleanup() {
		this.resetRoom();
		this.channelId = null;
		this.connected = false;
		this.connecting = false;
		this.reconnecting = false;
		this.leaving = false;
	}

	private async dropRoom(room: Room) {
		// Detached first, so its Disconnected event is seen as stale.
		if (this.room === room) this.room = null;
		try {
			await room.disconnect();
		} catch {
			/* ignore */
		}
	}

	private async rejoin(channelId: number) {
		const gen = ++this.generation;
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
			this.muted = prev.muted;
			this.deafened = prev.deafened;
			this.persistSelfState();
			if (!next.muted && !next.deafened) toast.error(describeMicError(err));
			await this.applySelfState().catch(() => {});
		}
	}

	/** Toggle the mic. Unmuting while deafened also undeafens, since a live mic
	 *  you can't hear back through is never what was meant. */
	async toggleMute() {
		if (this.deafened) {
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

		// 1. Get a LiveKit token from ping-server (membership checked there).
		const { token, url } = await axiosClient
			.post('/api/voice/token', { channel_id: channelId })
			.then((r) => r.data);
		if (gen !== this.generation) return;

		// 2. Connect to LiveKit.
		const room = new Room({ adaptiveStream: true, dynacast: true });
		this.wireRoom(room);

		try {
			await room.connect(url, token);
			if (gen !== this.generation) return await this.dropRoom(room);
			// Only a connected room is current. A failed attempt emits Disconnected
			// before connect() rejects, and that must not count as a lost connection.
			this.room = room;

			// 3. Publish the mic unless the user left muted or deafened last time.
			// A mic that can't start leaves the user in the call, listen-only.
			try {
				await this.applySelfState();
			} catch (err) {
				if (gen !== this.generation) return await this.dropRoom(room);
				this.muted = true;
				this.persistSelfState();
				toast.error(describeMicError(err));
				await this.applySelfState().catch(() => {});
			}
			if (gen !== this.generation) return await this.dropRoom(room);

			// 4. Seed the peers map: self + everyone already in the room.
			this.upsertPeer(room.localParticipant);
			room.remoteParticipants.forEach((p) => {
				this.upsertPeer(p);
				// Existing tracks fire TrackSubscribed automatically on connect.
			});

			this.connected = true;
			this.connecting = false;
			this.reconnecting = false;
		} catch (err) {
			await this.dropRoom(room);
			if (gen !== this.generation) return;
			throw err;
		}
	}

	async leaveVoice() {
		this.leaving = true;
		this.generation++;
		if (this.room) {
			try {
				await this.room.disconnect();
			} catch {
				/* ignore */
			}
		}
		this.cleanup();
	}
}

export const voiceState = new VoiceState();
