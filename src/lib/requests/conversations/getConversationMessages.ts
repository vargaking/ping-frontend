import { pageParams, type MessagePage, type PageQuery } from '../channels/getChannelMessages';
import { axiosClient } from '../axiosClient';

export const getConversationMessages = async (
	conversationId: number,
	query: PageQuery = {},
	limit = 50
): Promise<MessagePage> => {
	const response = await axiosClient.get(`/conversations/${conversationId}/messages`, {
		params: pageParams(query, limit)
	});
	return response.data;
};
