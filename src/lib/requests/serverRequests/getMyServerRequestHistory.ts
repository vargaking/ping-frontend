import type { ServerRequest } from '$lib/types/serverRequest.types';
import { axiosClient } from '../axiosClient';

export const getMyServerRequestHistory = async (): Promise<ServerRequest[]> => {
	const response = await axiosClient.get<ServerRequest[]>('/server-requests/me/history');
	return response.data;
};
