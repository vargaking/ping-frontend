import type { ServerMember } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const getServerMembers = async (serverId: number): Promise<ServerMember[]> => {
	const response = await axiosClient.get<ServerMember[]>(`/servers/${serverId}/members`);
	return response.data;
};
