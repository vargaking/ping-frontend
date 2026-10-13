import type { Role } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const createRole = async (serverId: number, name: string, allow?: bigint): Promise<Role> => {
	const response = await axiosClient.post<Role>(`/servers/${serverId}/roles`, {
		name,
		...(allow ? { allow: String(allow) } : {})
	});
	return response.data;
};
