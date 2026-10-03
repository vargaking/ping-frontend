import type { AdminServerRequest } from '$lib/types/serverRequest.types';
import { axiosClient } from '../axiosClient';

export const listServerRequests = async (
	status: 'pending' | 'all'
): Promise<AdminServerRequest[]> => {
	const response = await axiosClient.get<AdminServerRequest[]>('/server-requests', {
		params: { status }
	});
	return response.data;
};
