import type { User } from '$lib/types/auth.types';
import { conversationsState } from '$lib/states/conversationsState.svelte';
import { serversState } from '$lib/states/serversState.svelte';

/** Users who can be @mentioned in a server channel or a DM thread. In a
 *  private channel, only the members who can view it. */
export function mentionCandidates(target: {
	serverId?: number | null;
	channelId?: number | null;
	conversationId?: number | null;
}): User[] {
	if (target.serverId != null) {
		const members = serversState.servers[target.serverId]?.members ?? [];
		const channel =
			target.channelId != null ? serversState.channels[target.serverId]?.[target.channelId] : null;
		const viewers = channel?.private ? serversState.channelViewers[channel.id] : undefined;
		if (!viewers) return members;
		const allowed = new Set(viewers);
		return members.filter((m) => allowed.has(m.id));
	}
	if (target.conversationId != null) {
		const other = conversationsState.conversations[target.conversationId]?.other_user;
		return other ? [other] : [];
	}
	return [];
}
