import type { ForumPostCreate, ForumPostCreated } from '$lib/types/forum.types';
import { axiosClient } from '../axiosClient';

export const createForumPost = async (
	channelId: number,
	body: ForumPostCreate
): Promise<ForumPostCreated> => {
	const response = await axiosClient.post<ForumPostCreated>(`/channels/${channelId}/posts`, body);
	return response.data;
};
