import { usersState } from './usersState.svelte';
import { voicePresenceState } from './voicePresenceState.svelte';
import { voiceState, type VoicePeer } from './voiceState.svelte';

export interface VoiceMember {
	userId: number;
	self: boolean;
	muted: boolean;
	deafened: boolean;
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
	const members: VoiceMember[] = voicePresenceState.participants(channelId).map((p) => ({
		userId: p.user_id,
		self: p.user_id === selfId,
		muted: p.muted,
		deafened: p.deafened,
		speaking: false,
		streaming: false
	}));

	const inCall =
		voiceState.channelId === channelId &&
		(voiceState.connecting || voiceState.connected || voiceState.reconnecting);
	if (!inCall) return members;

	const withPeer = (member: VoiceMember, peer: VoicePeer | undefined): VoiceMember => {
		if (member.self) {
			// Presence lags the user's own toggles.
			return {
				...member,
				muted: voiceState.micOff,
				deafened: voiceState.deafened,
				speaking: peer?.isSpeaking ?? false,
				streaming: peer?.streaming ?? false
			};
		}
		if (!peer) return member;
		return {
			...member,
			muted: peer.muted,
			deafened: peer.deafened,
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
		roster.push(
			withPeer(
				{
					userId,
					self: userId === selfId,
					muted: peer.muted,
					deafened: peer.deafened,
					speaking: false,
					streaming: false
				},
				peer
			)
		);
	}

	if (selfId != null && !listed(selfId)) {
		roster.push(
			withPeer(
				{
					userId: selfId,
					self: true,
					muted: false,
					deafened: false,
					speaking: false,
					streaming: false
				},
				undefined
			)
		);
	}
	return roster;
}
