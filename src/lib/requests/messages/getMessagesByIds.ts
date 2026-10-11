import type { MessageType } from '$lib/types/messages.types';
import { axiosClient } from '../axiosClient';

export const MAX_IDS_PER_REQUEST = 100;

/** Ids the caller can't see, or that don't exist, are missing from the answer. */
export const getMessagesByIds = async (
	ids: string[],
	signal?: AbortSignal
): Promise<MessageType[]> => {
	if (ids.length > MAX_IDS_PER_REQUEST) {
		throw new RangeError(`At most ${MAX_IDS_PER_REQUEST} ids per request`);
	}
	const params = new URLSearchParams();
	for (const id of ids) params.append('ids', id);
	const response = await axiosClient.get<{ messages: MessageType[] }>('/messages', {
		params,
		signal
	});
	return response.data.messages;
};
