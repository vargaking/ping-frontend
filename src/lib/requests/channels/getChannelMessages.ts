import type { MessageType } from '$lib/types/messages.types';
import { axiosClient } from '../axiosClient';

export type MessagePage = {
	messages: MessageType[];
	next_cursor: string | null;
	has_more: boolean;
};

export const getChannelMessages = async (
	channelId: number,
	before?: string | null,
	limit = 50,
	postId?: number
): Promise<MessagePage> => {
	const response = await axiosClient.get(`/channels/${channelId}/messages`, {
		params: { limit, ...(before ? { before } : {}), ...(postId != null ? { post_id: postId } : {}) }
	});
	return response.data;
};
