import { axiosClient } from '../axiosClient';

export const deleteChannel = async (channelId: number): Promise<void> => {
	await axiosClient.delete(`/channels/${channelId}`);
};
