import type { Server } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const createServer = async (server: Server): Promise<Server> => {
	const response = await axiosClient.post<Server>('/servers/', server);
	return response.data;
};
