import type { Server } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const getServers = async (): Promise<Server[]> => {
	const response = await axiosClient.get<Server[]>('/servers/');
	return response.data;
};
