import type { ImportPiece } from '$lib/types/serverImport.types';
import { axiosClient } from '../axiosClient';

export const uploadImportPiece = async (
	serverId: number,
	importId: string,
	offset: number,
	piece: Blob,
	signal?: AbortSignal
): Promise<ImportPiece> => {
	const response = await axiosClient.put<ImportPiece>(
		`/servers/${serverId}/import/${importId}/data`,
		piece,
		{
			params: { offset },
			headers: { 'Content-Type': 'application/octet-stream' },
			// A piece on a slow link can take minutes.
			timeout: 0,
			signal
		}
	);
	return response.data;
};
