import type { User } from '$lib/types/auth.types';
import { conversationsState } from '$lib/states/conversationsState.svelte';
import { serversState } from '$lib/states/serversState.svelte';

/** Users who can be @mentioned in a server channel or a DM thread. */
export function mentionCandidates(target: {
	serverId?: number | null;
	conversationId?: number | null;
}): User[] {
	if (target.serverId != null) return serversState.servers[target.serverId]?.members ?? [];
	if (target.conversationId != null) {
		const other = conversationsState.conversations[target.conversationId]?.other_user;
		return other ? [other] : [];
	}
	return [];
}
