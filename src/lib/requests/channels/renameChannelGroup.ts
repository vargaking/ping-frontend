import type { ChannelGroup } from '$lib/types/channel.types';
import { axiosClient } from '../axiosClient';

export const renameChannelGroup = async (
	server_id: number,
	group_id: number,
	name: string
): Promise<ChannelGroup> => {
	const response = await axiosClient.patch<ChannelGroup>(
		`/servers/${server_id}/channel-groups/${group_id}`,
		{ name }
	);
	return response.data;
};
