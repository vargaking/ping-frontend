import type { ServerMember } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const updateMemberRoles = async (
	serverId: number,
	userId: number,
	roleIds: number[]
): Promise<ServerMember> => {
	const response = await axiosClient.put<ServerMember>(
		`/servers/${serverId}/members/${userId}/roles`,
		{ role_ids: roleIds }
	);
	return response.data;
};
