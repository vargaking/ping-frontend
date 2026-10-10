import type { MessageTarget } from '$lib/types/messages.types';

/** Key for a message thread. Channels keep their bare id; DMs and posts are
 *  prefixed to avoid clashes with channel ids. */
export function channelThreadKey(channelId: number): string {
	return String(channelId);
}

/** A forum post's replies are their own thread, apart from the forum channel's id. */
export function postThreadKey(postId: number): string {
	return `post:${postId}`;
}

export function directThreadKey(conversationId: number): string {
	return `dm:${conversationId}`;
}

export function threadKey(target: MessageTarget): string {
	if (target.kind === 'direct') return directThreadKey(target.conversationId);
	return target.postId != null ? postThreadKey(target.postId) : channelThreadKey(target.channelId);
}
