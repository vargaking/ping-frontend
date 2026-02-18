import type { Server } from '$lib/types/server.types';
import { axiosClient } from '../axiosClient';

export const uploadServerIcon = async (serverId: number, file: File): Promise<Server> => {
	const formData = new FormData();
	formData.append('file', file);

	const response = await axiosClient.post<Server>(`/servers/${serverId}/icon`, formData, {
		headers: { 'Content-Type': 'multipart/form-data' }
	});
	return response.data;
};
