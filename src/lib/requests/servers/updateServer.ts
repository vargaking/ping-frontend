import type { Server } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const updateServer = async (serverId: number, server: Partial<Server>): Promise<Server> => {
	const response = await axiosClient.put<Server>(`/servers/${serverId}`, server);
	return response.data;
};
