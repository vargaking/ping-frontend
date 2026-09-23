import type { MessagePage } from '../channels/getChannelMessages';
import { axiosClient } from '../axiosClient';

export const getConversationMessages = async (
	conversationId: number,
	before?: string | null,
	limit = 50
): Promise<MessagePage> => {
	const response = await axiosClient.get(`/conversations/${conversationId}/messages`, {
		params: { limit, ...(before ? { before } : {}) }
	});
	return response.data;
};
