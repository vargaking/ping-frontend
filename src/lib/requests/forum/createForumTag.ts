import type { ForumTag } from '$lib/types/forum.types';
import { axiosClient } from '../axiosClient';

export const createForumTag = async (
	channelId: number,
	name: string,
	color: string | null
): Promise<ForumTag> => {
	const response = await axiosClient.post<ForumTag>(`/channels/${channelId}/tags`, {
		name,
		color
	});
	return response.data;
};
