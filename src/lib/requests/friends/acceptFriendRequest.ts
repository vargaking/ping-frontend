import type { FriendshipResult } from '$lib/types/friend.types';
import { axiosClient } from '../axiosClient';

export const acceptFriendRequest = async (userId: number): Promise<FriendshipResult> => {
	const response = await axiosClient.post<FriendshipResult>(`/friends/${userId}/accept`);
	return response.data;
};
