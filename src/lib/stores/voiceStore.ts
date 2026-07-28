import { writable, get } from 'svelte/store';
import {
	Room,
	RoomEvent,
	Track,
	type RemoteTrack,
	type RemoteTrackPublication,
	type RemoteParticipant,
	type Participant
} from 'livekit-client';
import { UserStore, CurrentServerIdStore } from './userStore';
import { axiosClient } from '../requests/axiosClient';

export interface VoicePeer {
	id: string;
	username: string;
	profile: any;
	isSpeaking: boolean;
}

export interface VoiceState {
	channelId: number | null;
	connected: boolean;
	connecting: boolean;
	peers: Map<string, VoicePeer>; // participant identity (user id) -> VoicePeer
}

const initialState: VoiceState = {
	channelId: null,
	connected: false,
	connecting: false,
	peers: new Map()
};

function createVoiceStore() {
	const { subscribe, update, set } = writable<VoiceState>(initialState);

	let room: Room | null = null;
	// One <audio> element per remote track, attached to the DOM so it plays.
	const audioEls = new Map<string, HTMLAudioElement>();

	function parseProfile(p: Participant): any {
		// We stash the user's profile JSON in participant metadata when we can;
		// fall back to empty. Username comes from participant.name.
		if (!p.metadata) return {};
		try {
			return JSON.parse(p.metadata);
		} catch {
			return {};
		}
	}

	function upsertPeer(p: Participant, isSelf = false) {
		update((s) => {
			const peers = new Map(s.peers);
			peers.set(p.identity, {
				id: p.identity,
				username: (p.name || 'Unknown') + (isSelf ? ' (You)' : ''),
				profile: parseProfile(p),
				isSpeaking: p.isSpeaking
			});
			return { ...s, peers };
		});
	}

	function removePeer(identity: string) {
		update((s) => {
			const peers = new Map(s.peers);
			peers.delete(identity);
			return { ...s, peers };
		});
	}

	function attachTrack(track: RemoteTrack) {
		if (track.kind !== Track.Kind.Audio) return; // audio-only for now
		const el = track.attach() as HTMLAudioElement;
		el.autoplay = true;
		document.body.appendChild(el);
		audioEls.set(track.sid ?? Math.random().toString(36), el);
	}

	function detachTrack(track: RemoteTrack) {
		track.detach().forEach((el) => el.remove());
		if (track.sid) audioEls.delete(track.sid);
	}

	function wireRoom(r: Room) {
		r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
			attachTrack(track);
		})
			.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
				detachTrack(track);
			})
			.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
				upsertPeer(p);
			})
			.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
				removePeer(p.identity);
			})
			.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
				const speaking = new Set(speakers.map((p) => p.identity));
				update((s) => {
					const peers = new Map(s.peers);
					for (const [id, peer] of peers) {
						const isSpeaking = speaking.has(id);
						if (peer.isSpeaking !== isSpeaking) peers.set(id, { ...peer, isSpeaking });
					}
					return { ...s, peers };
				});
			})
			.on(RoomEvent.Disconnected, () => {
				cleanup();
			});
	}

	function cleanup() {
		audioEls.forEach((el) => {
			el.pause();
			el.srcObject = null;
			el.remove();
		});
		audioEls.clear();
		room = null;
		set(initialState);
	}

	return {
		subscribe,

		joinVoice: async (channelId: number) => {
			const user = get(UserStore);
			const serverId = get(CurrentServerIdStore);
			if (!user || !serverId) return;

			// Already connected somewhere: leave first.
			if (room) await voiceStore.leaveVoice();

			update((s) => ({ ...s, connecting: true, channelId }));

			try {
				// 1. Get a LiveKit token from ping-server (membership checked there).
				const { token, url } = await axiosClient
					.post('/api/voice/token', { channel_id: channelId })
					.then((r) => r.data);

				// 2. Connect to LiveKit.
				room = new Room({ adaptiveStream: true, dynacast: true });
				wireRoom(room);
				await room.connect(url, token);

				// 3. Publish the mic (audio-only).
				if (!navigator.mediaDevices?.getUserMedia) {
					throw new Error(
						'Voice chat requires a secure context (HTTPS or localhost).'
					);
				}
				await room.localParticipant.setMicrophoneEnabled(true);

				// 4. Seed the peers map: self + everyone already in the room.
				upsertPeer(room.localParticipant, true);
				room.remoteParticipants.forEach((p) => {
					upsertPeer(p);
					// Existing tracks fire TrackSubscribed automatically on connect.
				});

				update((s) => ({ ...s, connected: true, connecting: false, channelId }));
			} catch (err) {
				console.error('Error joining voice:', err);
				if (room) {
					try {
						await room.disconnect();
					} catch {
						/* ignore */
					}
				}
				cleanup();
			}
		},

		leaveVoice: async () => {
			if (room) {
				try {
					await room.disconnect();
				} catch {
					/* ignore */
				}
			}
			cleanup();
		}
	};
}

export const voiceStore = createVoiceStore();
