import {
	Room,
	RoomEvent,
	Track,
	type RemoteTrack,
	type RemoteParticipant,
	type Participant
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
}

class VoiceState {
	channelId: number | null = $state(null);
	connected: boolean = $state(false);
	connecting: boolean = $state(false);
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

	private upsertPeer(p: Participant, isSelf = false) {
		this.peers.set(p.identity, {
			id: p.identity,
			username: (p.name || 'Unknown') + (isSelf ? ' (You)' : ''),
			profile: this.parseProfile(p),
			isSpeaking: p.isSpeaking
		});
	}

	private removePeer(identity: string) {
		this.peers.delete(identity);
	}

	private attachTrack(track: RemoteTrack) {
		if (track.kind !== Track.Kind.Audio) return; // audio-only for now
		const el = track.attach() as HTMLAudioElement;
		el.autoplay = true;
		document.body.appendChild(el);
		this.audioEls.set(track.sid ?? Math.random().toString(36), el);
	}

	private detachTrack(track: RemoteTrack) {
		track.detach().forEach((el) => el.remove());
		if (track.sid) this.audioEls.delete(track.sid);
	}

	private wireRoom(r: Room) {
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
		this.peers = new SvelteMap();
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

			// 3. Publish the mic (audio-only).
			if (!navigator.mediaDevices?.getUserMedia) {
				throw new Error('Voice chat requires a secure context (HTTPS or localhost).');
			}
			await this.room.localParticipant.setMicrophoneEnabled(true);

			// 4. Seed the peers map: self + everyone already in the room.
			this.upsertPeer(this.room.localParticipant, true);
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
