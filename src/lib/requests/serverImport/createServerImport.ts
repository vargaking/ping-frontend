import type { Import } from '$lib/types/serverImport.types';
import { axiosClient } from '../axiosClient';

export const createServerImport = async (
	serverId: number,
	filename: string,
	size: number
): Promise<Import> => {
	const response = await axiosClient.post<Import>(`/servers/${serverId}/import`, {
		filename,
		size
	});
	return response.data;
};
