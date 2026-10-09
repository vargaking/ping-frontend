import type { ChannelSnapshot } from '$lib/types/channel.types';
import type { Conversation } from '$lib/types/conversation.types';
import type { ForumPostPage } from '$lib/types/forum.types';
import type { HistoryApi, SyncThread } from '$lib/utils/historySync';
import { axiosClient } from './axiosClient';
import type { MessagePage } from './channels/getChannelMessages';

const PAGE_LIMIT = 100;

function messagesRequest(thread: SyncThread, before: string | null) {
	const params = { limit: PAGE_LIMIT, ...(before ? { before } : {}) };
	if (thread.kind === 'direct') {
		return { url: `/conversations/${thread.conversationId}/messages`, params };
	}
	const url = `/channels/${thread.channelId}/messages`;
	return { url, params: thread.kind === 'post' ? { ...params, post_id: thread.postId } : params };
}

export const historyApi: HistoryApi = {
	async channels(serverId, signal) {
		const response = await axiosClient.get<ChannelSnapshot>(`/servers/${serverId}/channels`, {
			signal
		});
		return response.data.channels;
	},
	async posts(channelId, cursor, signal) {
		const response = await axiosClient.get<ForumPostPage>(`/channels/${channelId}/posts`, {
			params: cursor ? { cursor } : {},
			signal
		});
		return response.data;
	},
	async conversations(signal) {
		const response = await axiosClient.get<Conversation[]>('/conversations/', { signal });
		return response.data;
	},
	async page(thread, before, signal) {
		const { url, params } = messagesRequest(thread, before);
		const response = await axiosClient.get<MessagePage>(url, { params, signal });
		return response.data;
	}
};
