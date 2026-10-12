import { axiosClient } from '../axiosClient';

export type MessageChange = { id: string; kind: 'edited' | 'deleted'; at: string };

export type MessageChangesPage = {
	/** The server no longer remembers changes back to our cursor: the local copy can't be trusted. */
	reset: boolean;
	changes: MessageChange[];
	/** Opaque. Pass it as `since` to continue from here. */
	cursor: string;
	has_more: boolean;
};

/** Without `since` the server only answers with a cursor for "now". */
export const getMessageChanges = async (
	since?: string,
	limit = 500,
	signal?: AbortSignal
): Promise<MessageChangesPage> => {
	const response = await axiosClient.get<MessageChangesPage>('/messages/changes', {
		params: { limit, ...(since ? { since } : {}) },
		signal
	});
	return response.data;
};
