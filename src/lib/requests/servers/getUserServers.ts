import type { Server } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const getUserServers = async (): Promise<Server[]> => {
	const response = await axiosClient.get<Server[]>(`/servers/me`);
	return response.data;
};
