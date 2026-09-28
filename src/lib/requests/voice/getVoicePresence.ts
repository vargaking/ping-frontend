import type { VoicePresenceChannel } from '$lib/types/voice.types';
import { axiosClient } from '../axiosClient';

export const getVoicePresence = async (serverId: number): Promise<VoicePresenceChannel[]> => {
	const response = await axiosClient.get(`/api/voice/presence/${serverId}`);
	return response.data;
};
