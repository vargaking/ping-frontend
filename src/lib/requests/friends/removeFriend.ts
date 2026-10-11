import { axiosClient } from '../axiosClient';

export const removeFriend = async (userId: number): Promise<void> => {
	await axiosClient.delete(`/friends/${userId}`);
};
