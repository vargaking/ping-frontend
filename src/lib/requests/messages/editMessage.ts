import type { JSONContent } from '@tiptap/core';
import type { MessageType } from '$lib/types/messages.types';
import { axiosClient } from '../axiosClient';

export const editMessage = async (
	messageId: string,
	content: JSONContent
): Promise<MessageType> => {
	const response = await axiosClient.patch<MessageType>(`/messages/${messageId}`, { content });
	return response.data;
};
