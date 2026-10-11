import type { FriendshipResult, FriendTarget } from '$lib/types/friend.types';
import { axiosClient } from '../axiosClient';

export const sendFriendRequest = async (target: FriendTarget): Promise<FriendshipResult> => {
	const response = await axiosClient.post<FriendshipResult>('/friends/requests', target);
	return response.data;
};
