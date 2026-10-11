import type { Import, PrivateSelection } from '$lib/types/serverImport.types';
import { axiosClient } from '../axiosClient';

/** Without `privateChannels` the server keeps the selection it already stored. */
export const startServerImport = async (
	serverId: number,
	importId: string,
	privateChannels?: PrivateSelection
): Promise<Import> => {
	const response = await axiosClient.post<Import>(
		`/servers/${serverId}/import/${importId}/start`,
		privateChannels === undefined ? undefined : { private_channels: privateChannels }
	);
	return response.data;
};
