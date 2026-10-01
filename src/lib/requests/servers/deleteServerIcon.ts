import type { Server } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const deleteServerIcon = async (serverId: number): Promise<Server> => {
	const response = await axiosClient.delete<Server>(`/servers/${serverId}/icon`);
	return response.data;
};
