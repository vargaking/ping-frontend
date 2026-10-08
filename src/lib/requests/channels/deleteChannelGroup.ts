import { axiosClient } from '../axiosClient';

export const deleteChannelGroup = async (server_id: number, group_id: number): Promise<void> => {
	await axiosClient.delete(`/servers/${server_id}/channel-groups/${group_id}`);
};
