import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { serversState } from '$lib/states/serversState.svelte';
import { voiceState } from '$lib/states/voiceState.svelte';

/**
 * Drop a deleted server from local state and move the user out of it if they
 * were in it. `byMe` suppresses the notice for our own delete.
 */
export async function serverRemoved(serverId: number, byMe = false) {
	const wasSelected = serversState.selectedServer?.id === serverId;
	const inItsVoice =
		wasSelected &&
		voiceState.channelId != null &&
		serversState.selectedServerChannels[voiceState.channelId] != null;
	const name = serversState.servers[serverId]?.name;

	if (inItsVoice) await voiceState.leaveVoice();
	// Leave the server's routes first: while they're mounted, dropping the
	// server from state makes them refetch its (now missing) channels.
	if (wasSelected) await goto('/app/direct/');
	serversState.removeServer(serverId);
	if (!byMe && name) toast(`${name} was deleted by its owner`);
}
