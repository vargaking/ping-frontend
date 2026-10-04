import { axiosClient } from '../axiosClient';

export const deleteRole = async (serverId: number, roleId: number): Promise<void> => {
	await axiosClient.delete(`/servers/${serverId}/roles/${roleId}`);
};
