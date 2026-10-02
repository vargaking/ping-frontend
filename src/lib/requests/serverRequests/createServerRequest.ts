import type { ServerRequest, ServerRequestInput } from '$lib/types/serverRequest.types';
import { axiosClient } from '../axiosClient';

export const createServerRequest = async (input: ServerRequestInput): Promise<ServerRequest> => {
	const response = await axiosClient.post<ServerRequest>('/server-requests', input);
	return response.data;
};
