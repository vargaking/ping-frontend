import type { ChannelSnapshot } from '$lib/types/channel.types';
import { axiosClient } from '../axiosClient';

export const getServerChannelSnapshot = async (server_id: number): Promise<ChannelSnapshot> => {
	const response = await axiosClient.get<ChannelSnapshot>(`/servers/${server_id}/channels`);
	return response.data;
};
