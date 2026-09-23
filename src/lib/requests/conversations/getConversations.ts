import type { Conversation } from '$lib/types/conversation.types';
import { axiosClient } from '../axiosClient';

export const getConversations = async (): Promise<Conversation[]> => {
	const response = await axiosClient.get<Conversation[]>('/conversations/');
	return response.data;
};
