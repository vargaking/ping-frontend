import { axiosClient } from '../axiosClient';

export const declineFriendRequest = async (userId: number): Promise<void> => {
	await axiosClient.post(`/friends/${userId}/decline`);
};
