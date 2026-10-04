import type { ChannelLayout } from '$lib/types/channel.types';
import { axiosClient } from '../axiosClient';

export const setChannelLayout = async (
	server_id: number,
	layout: ChannelLayout
): Promise<ChannelLayout> => {
	const response = await axiosClient.put<ChannelLayout>(
		`/servers/${server_id}/channel-layout`,
		layout
	);
	return response.data;
};
