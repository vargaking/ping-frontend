import type { Conversation } from '$lib/types/conversation.types';
import { axiosClient } from '../axiosClient';

/** Get-or-create the 1:1 conversation with another user. */
export const openConversation = async (userId: number): Promise<Conversation> => {
	const response = await axiosClient.post<Conversation>('/conversations/', { user_id: userId });
	return response.data;
};
