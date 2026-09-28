import { axiosClient } from '../axiosClient';

export type ConversationReadResponse = {
	conversation_id: number;
	last_read_message_id: string;
};

export const markConversationRead = async (
	conversationId: number,
	messageId: string
): Promise<ConversationReadResponse> => {
	const response = await axiosClient.put(`/conversations/${conversationId}/read`, {
		message_id: messageId
	});
	return response.data;
};
