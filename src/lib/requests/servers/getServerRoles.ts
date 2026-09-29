import type { Role } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const getServerRoles = async (serverId: number): Promise<Role[]> => {
	const response = await axiosClient.get<Role[]>(`/servers/${serverId}/roles`);
	return response.data;
};
