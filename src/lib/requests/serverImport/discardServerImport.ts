import { axiosClient } from '../axiosClient';

export const discardServerImport = async (serverId: number, importId: string): Promise<void> => {
	await axiosClient.delete(`/servers/${serverId}/import/${importId}`);
};
