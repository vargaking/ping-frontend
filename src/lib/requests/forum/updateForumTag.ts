import type { ForumTag } from '$lib/types/forum.types';
import { axiosClient } from '../axiosClient';

export type ForumTagUpdate = { name?: string; color?: string | null };

export const updateForumTag = async (
	channelId: number,
	tagId: number,
	update: ForumTagUpdate
): Promise<ForumTag> => {
	const response = await axiosClient.patch<ForumTag>(
		`/channels/${channelId}/tags/${tagId}`,
		update
	);
	return response.data;
};
