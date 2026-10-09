import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { serversState } from '$lib/states/serversState.svelte';
import { voiceState } from '$lib/states/voiceState.svelte';
import { forumState } from '$lib/states/forumState.svelte';
import { voicePresenceState } from '$lib/states/voicePresenceState.svelte';

/**
 * Drop a deleted channel from local state and move the user off it if they were
 * reading it or connected to it. `byMe` suppresses the notice for our own delete;
 * `lostAccess` says the channel still exists but we can no longer view it.
 */
export async function channelRemoved(
	serverId: number,
	channelId: number,
	byMe = false,
	lostAccess = false
) {
	const wasViewing =
		serversState.selectedServerId === serverId && serversState.selectedChannelId === channelId;
	const wasInVoice = voiceState.channelId === channelId;
	const name = serversState.channels[serverId]?.[channelId]?.name;

	serversState.removeChannel(serverId, channelId);
	voicePresenceState.forgetChannel(channelId);
	forumState.forgetChannel(channelId);

	if (wasInVoice) await voiceState.leaveVoice();
	if (wasViewing) await goto(`/app/server/${serverId}/`);
	if (!byMe && (wasViewing || wasInVoice)) {
		if (lostAccess) {
			toast(
				name ? `You no longer have access to #${name}` : 'You no longer have access to this channel'
			);
		} else {
			toast(name ? `#${name} was deleted` : 'This channel was deleted');
		}
	}
}
