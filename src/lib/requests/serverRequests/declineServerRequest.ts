import type { AdminServerRequest } from '$lib/types/serverRequest.types';
import { axiosClient } from '../axiosClient';

export const declineServerRequest = async (
	requestId: number,
	reason: string
): Promise<AdminServerRequest> => {
	const response = await axiosClient.post<AdminServerRequest>(
		`/server-requests/${requestId}/decline`,
		{ reason: reason.trim() || null }
	);
	return response.data;
};
