import type { Role } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const createRole = async (serverId: number, name: string): Promise<Role> => {
	const response = await axiosClient.post<Role>(`/servers/${serverId}/roles`, { name });
	return response.data;
};
