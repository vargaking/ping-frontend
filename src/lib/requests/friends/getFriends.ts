import type { FriendsList } from '$lib/types/friend.types';
import { axiosClient } from '../axiosClient';

export const getFriends = async (): Promise<FriendsList> => {
	const response = await axiosClient.get<FriendsList>('/friends/');
	return response.data;
};
