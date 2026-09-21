import { axiosClient } from '../axiosClient';

export const deleteMessage = async (messageId: string): Promise<void> => {
	await axiosClient.delete(`/messages/${messageId}`);
};
