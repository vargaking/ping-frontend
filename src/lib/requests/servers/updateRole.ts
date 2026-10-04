import type { Role } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export type RoleUpdate = {
	name?: string;
	color?: string | null;
	allow?: string;
	deny?: string;
	/** null clears the parent. */
	parent_id?: number | null;
};

export const updateRole = async (
	serverId: number,
	roleId: number,
	update: RoleUpdate
): Promise<Role> => {
	const response = await axiosClient.patch<Role>(`/servers/${serverId}/roles/${roleId}`, update);
	return response.data;
};
