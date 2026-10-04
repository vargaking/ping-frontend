import type { ForumPostDetail } from '$lib/types/forum.types';
import { axiosClient } from '../axiosClient';

export const getForumPost = async (channelId: number, postId: number): Promise<ForumPostDetail> => {
	const response = await axiosClient.get<ForumPostDetail>(`/channels/${channelId}/posts/${postId}`);
	return response.data;
};
