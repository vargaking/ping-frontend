import type { Role } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

/** `roleIds` lists every role except the default one, highest first. */
export const reorderRoles = async (serverId: number, roleIds: number[]): Promise<Role[]> => {
	const response = await axiosClient.put<Role[]>(`/servers/${serverId}/roles/order`, {
		role_ids: roleIds
	});
	return response.data;
};
