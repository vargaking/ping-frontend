import type { Import } from '$lib/types/serverImport.types';
import { axiosClient } from '../axiosClient';

export const startServerImport = async (serverId: number, importId: string): Promise<Import> => {
	const response = await axiosClient.post<Import>(`/servers/${serverId}/import/${importId}/start`);
	return response.data;
};
