import type { Call } from '$lib/types/call.types';
import { axiosClient } from '../axiosClient';

export const declineCall = async (callId: number): Promise<Call> => {
	const response = await axiosClient.post<Call>(`/api/calls/${callId}/decline`);
	return response.data;
};
