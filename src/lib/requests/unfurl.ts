import type { Embed } from '$lib/types/messages.types';
import { axiosClient } from './axiosClient';

/** Link preview for `url`, or null when there is none or it can't be fetched. */
export const unfurl = async (url: string, signal?: AbortSignal): Promise<Embed | null> => {
	try {
		const response = await axiosClient.get<Embed>('/unfurl', {
			params: { url },
			signal,
			validateStatus: (status) => status === 200 || status === 204
		});
		return response.status === 200 ? response.data : null;
	} catch {
		return null;
	}
};
