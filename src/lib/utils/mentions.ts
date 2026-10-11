import type { User } from '$lib/types/auth.types';
import { conversationsState } from '$lib/states/conversationsState.svelte';
import { serversState } from '$lib/states/serversState.svelte';
import { usersState } from '$lib/states/usersState.svelte';

type MentionTarget = {
	serverId?: number | null;
	channelId?: number | null;
	conversationId?: number | null;
};

const VIEWERS_FRESH_MS = 10_000;
const MAX_SUGGESTIONS = 5;

function privateChannelId(target: MentionTarget): number | null {
	if (target.serverId == null || target.channelId == null) return null;
	const channel = serversState.channels[target.serverId]?.[target.channelId];
	return channel?.private ? channel.id : null;
}

/** Users who can be @mentioned in a server channel or a DM thread. In a
 *  private channel, only the members who can view it. */
export function mentionCandidates(target: MentionTarget): User[] {
	if (target.serverId != null) {
		const members = serversState.servers[target.serverId]?.members ?? [];
		const channelId = privateChannelId(target);
		const viewers = channelId != null ? serversState.channelViewers[channelId] : undefined;
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

/** Brings the candidates up to date when a mention list opens. Nobody is told when
 *  someone else gains or loses access to a private channel, so its viewers are refetched. */
export function refreshMentionCandidates(target: MentionTarget) {
	const channelId = privateChannelId(target);
	if (channelId != null) void serversState.loadChannelViewers(channelId, VIEWERS_FRESH_MS);
}

/** The candidates whose current name starts with the query, as the list shows them. */
export function mentionSuggestions(candidates: User[], query: string): User[] {
	const prefix = query.toLowerCase();
	return candidates
		.map((m) => usersState.users[m.id] ?? m)
		.filter((user) => user.username.toLowerCase().startsWith(prefix))
		.slice(0, MAX_SUGGESTIONS);
}

/** Where the highlighted user is in the list; the first row when they are gone or none was picked. */
export function selectionIndex(users: User[], selectedId: number | null): number {
	return Math.max(
		0,
		users.findIndex((user) => user.id === selectedId)
	);
}
