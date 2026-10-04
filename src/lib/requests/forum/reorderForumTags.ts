import type { ForumTag } from '$lib/types/forum.types';
import { axiosClient } from '../axiosClient';

export const reorderForumTags = async (
	channelId: number,
	tagIds: number[]
): Promise<ForumTag[]> => {
	const response = await axiosClient.put<ForumTag[]>(`/channels/${channelId}/tags/order`, {
		tag_ids: tagIds
	});
	return response.data;
};
