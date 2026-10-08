import type { ForumPostPage } from '$lib/types/forum.types';
import { axiosClient } from '../axiosClient';

export const getForumPosts = async (
	channelId: number,
	tagIds: number[] = [],
	cursor?: string | null
): Promise<ForumPostPage> => {
	const params = new URLSearchParams();
	if (cursor) params.set('cursor', cursor);
	for (const id of tagIds) params.append('tag_ids', String(id));
	const response = await axiosClient.get<ForumPostPage>(`/channels/${channelId}/posts`, { params });
	return response.data;
};
