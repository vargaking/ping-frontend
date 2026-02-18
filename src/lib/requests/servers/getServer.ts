import type { Server } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const getServer = async (serverId: number): Promise<Server> => {
	const response = await axiosClient.get<Server>(`/servers/${serverId}`);
	return response.data;
};
