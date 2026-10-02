import type { MyServerRequestState } from '$lib/types/serverRequest.types';
import { axiosClient } from '../axiosClient';

export const getMyServerRequest = async (): Promise<MyServerRequestState> => {
	const response = await axiosClient.get<MyServerRequestState>('/server-requests/me');
	return response.data;
};
