import { usersState } from './usersState.svelte';
import { voicePeerAudioState } from './voicePeerAudioState.svelte';
import { voicePresenceState } from './voicePresenceState.svelte';
import { voiceState, type VoicePeer } from './voiceState.svelte';

export interface VoiceMember {
	userId: number;
	channelId: number;
	/** Null until presence or the call says which server the channel is in. */
	serverId: number | null;
	self: boolean;
	/** The viewer is connected to this member's channel. */
	viewerInCall: boolean;
	muted: boolean;
	deafened: boolean;
	/** A moderator took their microphone away. */
	serverMuted: boolean;
	/** The viewer muted them for themselves. */
	localMuted: boolean;
	/** False until LiveKit knows. */
	speaking: boolean;
	/** False until LiveKit knows. */
	streaming: boolean;
	/** Shown until usersState has the user. */
	fallbackName?: string;
	fallbackAvatar?: string | null;
}

/**
 * Who is in a voice channel. Presence decides who is there; LiveKit only adds
 * media state, so joining a call never makes anyone drop out of the list.
 */
export function voiceRoster(channelId: number): VoiceMember[] {
	const selfId = usersState.loggedInUser?.id;
	const inCall =
		voiceState.channelId === channelId &&
		(voiceState.connecting || voiceState.connected || voiceState.reconnecting);
	const serverId =
		voicePresenceState.serverOf(channelId) ??
		(voiceState.channelId === channelId ? voiceState.serverId : null);

	const member = (userId: number, state: Partial<VoiceMember> = {}): VoiceMember => ({
		userId,
		channelId,
		serverId,
		self: userId === selfId,
		viewerInCall: inCall,
		muted: false,
		deafened: false,
		serverMuted: false,
		localMuted: voicePeerAudioState.get(userId).muted,
		speaking: false,
		streaming: false,
		...state
	});

	const members = voicePresenceState
		.participants(channelId)
		.map((p) =>
			member(p.user_id, { muted: p.muted, deafened: p.deafened, serverMuted: p.server_muted })
		);
	if (!inCall) return members;

	const withPeer = (m: VoiceMember, peer: VoicePeer | undefined): VoiceMember => {
		if (m.self) {
			// Presence lags the user's own toggles.
			return {
				...m,
				muted: voiceState.micOff || voiceState.serverMuted,
				deafened: voiceState.deafened,
				serverMuted: voiceState.serverMuted || m.serverMuted,
				speaking: peer?.isSpeaking ?? false,
				streaming: peer?.streaming ?? false
			};
		}
		if (!peer) return m;
		return {
			...m,
			muted: peer.muted,
			deafened: peer.deafened,
			serverMuted: peer.serverMuted,
			speaking: peer.isSpeaking,
			streaming: peer.streaming,
			fallbackName: peer.username,
			fallbackAvatar: peer.profile?.avatar
		};
	};

	const roster = members
		.filter((m) => m.self || !voiceState.departed.has(String(m.userId)))
		.map((m) => withPeer(m, voiceState.peers.get(String(m.userId))));
	const listed = (userId: number) => roster.some((m) => m.userId === userId);

	for (const [identity, peer] of voiceState.peers) {
		const userId = Number(identity);
		if (Number.isNaN(userId) || listed(userId) || voiceState.departed.has(identity)) continue;
		roster.push(withPeer(member(userId), peer));
	}

	if (selfId != null && !listed(selfId)) roster.push(withPeer(member(selfId), undefined));
	return roster;
}
