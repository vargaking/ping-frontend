import type { Channel } from '$lib/types/channel.types';
import { axiosClient } from '../axiosClient';

export const createChannel = async (
	server_id: number,
	name: string,
	type: 'text' | 'voice' | 'forum' = 'text',
	group_id: number | null = null
): Promise<Channel> => {
	const response = await axiosClient.post<Channel>(`/channels/${server_id}/create`, {
		name,
		type,
		group_id
	});
	return response.data;
};
