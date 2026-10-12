import type { CallToken } from '$lib/types/call.types';
import { axiosClient } from '../axiosClient';

/** For the person called, taking a token on a ringing call is the answer. */
export const getCallToken = async (callId: number): Promise<CallToken> => {
	const response = await axiosClient.post<CallToken>(`/api/calls/${callId}/token`);
	return response.data;
};
