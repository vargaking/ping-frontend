import type { AuthorMapping, AuthorsImport, Import } from '$lib/types/serverImport.types';
import { axiosClient } from '../axiosClient';

/** The owner gets the whole import back; everyone else only the authors part. */
export const saveImportAuthors = async (
	serverId: number,
	importId: string,
	authors: AuthorMapping
): Promise<Import | AuthorsImport> => {
	const response = await axiosClient.put<Import | AuthorsImport>(
		`/servers/${serverId}/import/${importId}/authors`,
		{
			authors
		}
	);
	return response.data;
};
