import type { Server, ServerSettings } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

/** Keys sent are merged into the stored settings; a null value removes the key. */
export type ServerUpdate = Partial<Omit<Server, 'server_settings'>> & {
	server_settings?: Partial<ServerSettings>;
};

export const updateServer = async (serverId: number, server: ServerUpdate): Promise<Server> => {
	const response = await axiosClient.put<Server>(`/servers/${serverId}`, server);
	return response.data;
};
