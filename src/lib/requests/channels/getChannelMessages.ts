import type { MessageType } from '$lib/types/messages.types';
import { axiosClient } from '../axiosClient';

export type MessagePage = {
	messages: MessageType[];
	next_cursor: string | null;
	has_more: boolean;
	/** Newer messages exist past this page. */
	has_newer?: boolean;
};

/** Older than a cursor (or the newest page), a window around a message, or what follows a message. */
export type PageQuery = { before?: string | null } | { around: string } | { after: string };

export function pageParams(query: PageQuery, limit: number): Record<string, string | number> {
	const params: Record<string, string | number> = { limit };
	if ('around' in query) params.around = query.around;
	else if ('after' in query) params.after = query.after;
	else if (query.before) params.before = query.before;
	return params;
}

export const getChannelMessages = async (
	channelId: number,
	query: PageQuery = {},
	limit = 50,
	postId?: number
): Promise<MessagePage> => {
	const response = await axiosClient.get(`/channels/${channelId}/messages`, {
		params: { ...pageParams(query, limit), ...(postId != null ? { post_id: postId } : {}) }
	});
	return response.data;
};
