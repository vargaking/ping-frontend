import type { WhatsNewSeen } from '$lib/types/whatsNew.types';
import { axiosClient } from '../axiosClient';

export const getWhatsNewState = async (): Promise<WhatsNewSeen> => {
	const response = await axiosClient.get<WhatsNewSeen>('/whats-new/state');
	return response.data;
};
