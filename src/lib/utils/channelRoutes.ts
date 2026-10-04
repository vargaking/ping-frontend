import type { Channel } from '$lib/types/channel.types';

const ROUTE = { text: 'channel', voice: 'voice', forum: 'forum' } as const;

export function channelPath(serverId: number, channel: Pick<Channel, 'id' | 'type'>): string {
	return `/app/server/${serverId}/${ROUTE[channel.type]}/${channel.id}/`;
}

export function postPath(serverId: number, channelId: number, postId: number): string {
	return `/app/server/${serverId}/forum/${channelId}/${postId}/`;
}
