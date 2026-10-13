import type { ImportedAuthorsResponse } from '$lib/types/serverImport.types';
import { axiosClient } from '../axiosClient';

export const getImportedAuthors = async (serverId: number): Promise<ImportedAuthorsResponse> => {
	const response = await axiosClient.get<ImportedAuthorsResponse>(
		`/servers/${serverId}/import/authors`
	);
	return response.data;
};
