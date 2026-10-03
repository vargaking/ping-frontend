import type { AdminServerRequest } from '$lib/types/serverRequest.types';
import { axiosClient } from '../axiosClient';

export const approveServerRequest = async (requestId: number): Promise<AdminServerRequest> => {
	const response = await axiosClient.post<AdminServerRequest>(
		`/server-requests/${requestId}/approve`
	);
	return response.data;
};
