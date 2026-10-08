import type { AuthorMapping, Import } from '$lib/types/serverImport.types';
import { axiosClient } from '../axiosClient';

export const saveImportAuthors = async (
	serverId: number,
	importId: string,
	authors: AuthorMapping
): Promise<Import> => {
	const response = await axiosClient.put<Import>(
		`/servers/${serverId}/import/${importId}/authors`,
		{
			authors
		}
	);
	return response.data;
};
