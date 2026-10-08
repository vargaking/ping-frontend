import { serversState } from '$lib/states/serversState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import type { ForumPost, ForumTag } from '$lib/types/forum.types';

export function authorName(serverId: number | null, authorId: number | null): string {
	if (authorId == null) return 'Deleted user';
	const member = serversState.servers[serverId ?? -1]?.members?.find((m) => m.id === authorId);
	return (member ?? usersState.users[authorId])?.username ?? 'Someone';
}

/** The post's tags that still exist, in the channel's tag order. */
export function tagsOf(post: ForumPost, tags: ForumTag[]): ForumTag[] {
	return tags.filter((tag) => post.tag_ids.includes(tag.id));
}

export const TAG_COLORS = [
	'#5b8def',
	'#3fb68b',
	'#d9a441',
	'#e0685f',
	'#a77be0',
	'#38b2c4',
	'#8b95a1'
];
