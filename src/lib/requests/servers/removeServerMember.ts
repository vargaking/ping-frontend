import { axiosClient } from '../axiosClient';

/** Kick a member, or leave the server when `userId` is yourself. */
export const removeServerMember = async (serverId: number, userId: number): Promise<void> => {
	await axiosClient.delete(`/servers/${serverId}/members/${userId}`);
};
