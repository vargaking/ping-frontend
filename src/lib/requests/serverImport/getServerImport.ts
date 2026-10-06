import type { ImportsResponse } from '$lib/types/serverImport.types';
import { axiosClient } from '../axiosClient';

export const getServerImport = async (serverId: number): Promise<ImportsResponse> => {
	const response = await axiosClient.get<ImportsResponse>(`/servers/${serverId}/import`);
	return response.data;
};
