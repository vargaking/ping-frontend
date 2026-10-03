import { axiosClient } from '../axiosClient';

export const setServerMute = async (
	serverId: number,
	userId: number,
	muted: boolean
): Promise<void> => {
	const url = `/api/voice/servers/${serverId}/members/${userId}/server-mute`;
	await (muted ? axiosClient.put(url) : axiosClient.delete(url));
};
