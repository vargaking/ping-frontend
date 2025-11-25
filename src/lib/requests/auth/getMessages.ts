import type { MessageType } from '$lib/types/messages.types';
import { axiosClient } from '../axiosClient';

export const getMessages = async (lastUpdated: string): Promise<MessageType[]> => {
	const response = await axiosClient.get(`/channels/messages/${lastUpdated}`);
	return response.data;
};
