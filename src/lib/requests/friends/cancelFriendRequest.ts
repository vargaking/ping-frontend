import { axiosClient } from '../axiosClient';

export const cancelFriendRequest = async (userId: number): Promise<void> => {
	await axiosClient.delete(`/friends/${userId}/request`);
};
