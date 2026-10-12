import type { Call } from '$lib/types/call.types';
import { axiosClient } from '../axiosClient';

/** The signed-in user's ringing and active calls. */
export const getActiveCalls = async (): Promise<Call[]> => {
	const response = await axiosClient.get<{ calls: Call[] }>('/api/calls/active');
	return response.data.calls;
};
