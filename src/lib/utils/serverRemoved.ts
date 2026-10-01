import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { serversState } from '$lib/states/serversState.svelte';
import { voiceState } from '$lib/states/voiceState.svelte';

const removing = new Set<number>();

const notices = {
	deleted: (name: string) => `${name} was deleted by its owner`,
	kicked: (name: string) => `You were removed from ${name}`
};

/**
 * Drop a server we're no longer in from local state and move the user out of
 * it if they were in it. No reason means we did it ourselves, so no notice.
 */
export async function serverRemoved(serverId: number, reason?: keyof typeof notices) {
	// Leaving reports back over the socket too; a second goto would cancel the
	// first and drop the server while its routes are still mounted.
	if (removing.has(serverId)) return;
	removing.add(serverId);
	try {
		await removeNow(serverId, reason);
	} finally {
		removing.delete(serverId);
	}
}

async function removeNow(serverId: number, reason?: keyof typeof notices) {
	const wasSelected = serversState.selectedServerId === serverId;
	const inItsVoice = voiceState.serverId === serverId;
	const name = serversState.servers[serverId]?.name;

	if (inItsVoice) await voiceState.leaveVoice();
	// Leave the server's routes first: while they're mounted, dropping the
	// server from state makes them refetch its (now missing) channels.
	if (wasSelected) await goto('/app/direct/');
	serversState.removeServer(serverId);
	if (reason && name) toast(notices[reason](name));
}
