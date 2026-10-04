import type { ChannelGroup } from '$lib/types/channel.types';
import { axiosClient } from '../axiosClient';

export const createChannelGroup = async (
	server_id: number,
	name: string
): Promise<ChannelGroup> => {
	const response = await axiosClient.post<ChannelGroup>(`/servers/${server_id}/channel-groups`, {
		name
	});
	return response.data;
};
