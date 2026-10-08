import type { ForumTag } from '$lib/types/forum.types';
import { axiosClient } from '../axiosClient';

export const getForumTags = async (channelId: number): Promise<ForumTag[]> => {
	const response = await axiosClient.get<ForumTag[]>(`/channels/${channelId}/tags`);
	return response.data;
};
