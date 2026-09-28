import type { Channel } from '$lib/types/channel.types';
import { axiosClient } from '../axiosClient';

export type ChannelUpdate = {
	name?: string;
	/** Empty or null clears the topic. */
	topic?: string | null;
};

export const updateChannel = async (channelId: number, update: ChannelUpdate): Promise<Channel> => {
	const response = await axiosClient.patch<Channel>(`/channels/${channelId}`, update);
	return response.data;
};
