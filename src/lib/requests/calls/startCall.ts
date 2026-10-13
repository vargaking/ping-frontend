import type { Call } from '$lib/types/call.types';
import { axiosClient } from '../axiosClient';

/** Starts a call in a DM, or returns the one already open there. */
export const startCall = async (conversationId: number): Promise<Call> => {
	const response = await axiosClient.post<Call>('/api/calls', { conversation_id: conversationId });
	return response.data;
};
