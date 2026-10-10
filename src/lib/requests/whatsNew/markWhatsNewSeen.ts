import type { WhatsNewSeen } from '$lib/types/whatsNew.types';
import { axiosClient } from '../axiosClient';

export const markWhatsNewSeen = async (
	lastSeenId: string
): Promise<Pick<WhatsNewSeen, 'last_seen_id'>> => {
	const response = await axiosClient.put<Pick<WhatsNewSeen, 'last_seen_id'>>('/whats-new/state', {
		last_seen_id: lastSeenId
	});
	return response.data;
};
