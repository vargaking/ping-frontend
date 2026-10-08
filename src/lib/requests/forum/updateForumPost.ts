import type { ForumPost, ForumPostUpdate } from '$lib/types/forum.types';
import { axiosClient } from '../axiosClient';

export const updateForumPost = async (
	postId: number,
	update: ForumPostUpdate
): Promise<ForumPost> => {
	const response = await axiosClient.patch<ForumPost>(`/posts/${postId}`, update);
	return response.data;
};
