import { useInvite } from '$lib/requests/invites';
import { serversState } from '$lib/states/serversState.svelte';

/** Joins through an invite and returns the server's id once the server is in the user's list. */
export async function joinInvite(inviteId: string, password?: string): Promise<number> {
	const result = await useInvite(inviteId, password === undefined ? {} : { password });

	await serversState.fetchUserServers();
	serversState
		.fetchServerChannels(result.server_id)
		.catch((e) => console.warn('Failed to load channels for joined server', e));

	return result.server_id;
}
