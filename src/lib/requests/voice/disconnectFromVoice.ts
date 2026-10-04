import { axiosClient } from '../axiosClient';

/** Pull a member out of the server's voice channels. They can rejoin. */
export const disconnectFromVoice = async (serverId: number, userId: number): Promise<void> => {
	await axiosClient.post(`/api/voice/servers/${serverId}/members/${userId}/disconnect`);
};
