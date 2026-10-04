import { axiosClient } from '../axiosClient';

export const deleteForumTag = async (channelId: number, tagId: number): Promise<void> => {
	await axiosClient.delete(`/channels/${channelId}/tags/${tagId}`);
};
