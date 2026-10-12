import type { Call } from '$lib/types/call.types';
import { isOpenCall } from '$lib/utils/callText';
import { usersState } from './usersState.svelte';
import { voicePeerAudioState } from './voicePeerAudioState.svelte';
import type { VoiceMember } from './voiceRoster.svelte';
import { voiceState } from './voiceState.svelte';

/**
 * The two people of a DM call for the call view. The person being called shows as
 * "Ringing…" until they are in the room.
 */
export function callRoster(call: Call | null, conversationId: number): VoiceMember[] {
	const selfId = usersState.loggedInUser?.id;
	const inRoom =
		voiceState.isInCall(conversationId) &&
		(voiceState.connecting || voiceState.connected || voiceState.reconnecting);
	if (!call || (!inRoom && !isOpenCall(call.state))) return [];

	return [call.caller_id, call.callee_id].flatMap((userId) => {
		const self = userId === selfId;
		const peer = voiceState.peers.get(String(userId));
		const present = inRoom && (self || (peer != null && !voiceState.departed.has(String(userId))));
		const ringing = call.state === 'ringing' && userId === call.callee_id;
		if (inRoom && !present && call.state !== 'ringing') return [];

		const member: VoiceMember = {
			userId,
			channelId: null,
			serverId: null,
			self,
			viewerInCall: inRoom,
			muted: false,
			deafened: false,
			serverMuted: false,
			localMuted: voicePeerAudioState.get(userId).muted,
			speaking: false,
			streaming: false,
			fallbackName: self ? undefined : peer?.username,
			fallbackAvatar: peer?.profile?.avatar,
			status: !present && ringing ? 'Ringing…' : undefined
		};
		if (!present) return [member];
		if (self) {
			return [
				{
					...member,
					muted: voiceState.micOff || voiceState.serverMuted,
					deafened: voiceState.deafened,
					serverMuted: voiceState.serverMuted,
					speaking: peer?.isSpeaking ?? false,
					streaming: peer?.streaming ?? false
				}
			];
		}
		return [
			{
				...member,
				muted: peer?.muted ?? false,
				deafened: peer?.deafened ?? false,
				serverMuted: peer?.serverMuted ?? false,
				speaking: peer?.isSpeaking ?? false,
				streaming: peer?.streaming ?? false
			}
		];
	});
}
