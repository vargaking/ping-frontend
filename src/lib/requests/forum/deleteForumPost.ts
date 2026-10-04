import { axiosClient } from '../axiosClient';

export const deleteForumPost = async (postId: number): Promise<void> => {
	await axiosClient.delete(`/posts/${postId}`);
};
