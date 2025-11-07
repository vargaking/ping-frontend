import type { Channel } from '$lib/types/channel.types';
import { axiosClient } from '../axiosClient';

export const getUserChannels = async (server_id: number): Promise<Channel[]> => {
	const response = await axiosClient.get(`/channels/${server_id}`);
	return response.data;
};
