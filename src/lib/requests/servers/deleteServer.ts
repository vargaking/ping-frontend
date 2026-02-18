import { axiosClient } from '../axiosClient';

export const deleteServer = async (serverId: number): Promise<void> => {
	await axiosClient.delete(`/servers/${serverId}`);
};
