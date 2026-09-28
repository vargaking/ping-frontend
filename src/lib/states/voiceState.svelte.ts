import {
	Room,
	RoomEvent,
	Track,
	type RemoteTrack,
	type RemoteParticipant,
	type Participant,
	type TrackPublication
} from 'livekit-client';
import { SvelteMap } from 'svelte/reactivity';
import { usersState } from './usersState.svelte';
import { serversState } from './serversState.svelte';
import { axiosClient } from '$lib/requests/axiosClient';

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
			.on(RoomEvent.Disconnected, () => {
				this.cleanup();
			});
	}

	private cleanup() {
		this.audioEls.forEach((el) => {
			el.pause();
			el.srcObject = null;
			el.remove();
		});
		this.audioEls.clear();
		this.room = null;
		this.channelId = null;
		this.connected = false;
		this.connecting = false;
		// muted/deafened are the user's preference and carry over to the next join.
		this.sharedDeafened = null;
		this.peers = new SvelteMap();
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

		// Already connected somewhere: leave first.
		if (this.room) await this.leaveVoice();

		this.connecting = true;
		this.channelId = channelId;

		try {
			// 1. Get a LiveKit token from ping-server (membership checked there).
			const { token, url } = await axiosClient
				.post('/api/voice/token', { channel_id: channelId })
				.then((r) => r.data);

			// 2. Connect to LiveKit.
			this.room = new Room({ adaptiveStream: true, dynacast: true });
			this.wireRoom(this.room);
			await this.room.connect(url, token);

			// 3. Publish the mic unless the user left muted or deafened last time.
			if (!navigator.mediaDevices?.getUserMedia) {
				throw new Error('Voice chat requires a secure context (HTTPS or localhost).');
			}
			await this.applySelfState();

			// 4. Seed the peers map: self + everyone already in the room.
			this.upsertPeer(this.room.localParticipant);
			this.room.remoteParticipants.forEach((p) => {
				this.upsertPeer(p);
				// Existing tracks fire TrackSubscribed automatically on connect.
			});

			this.connected = true;
			this.connecting = false;
			this.channelId = channelId;
		} catch (err) {
			console.error('Error joining voice:', err);
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

	async leaveVoice() {
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
