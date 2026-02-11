import type { User } from '$lib/types/auth.types';
import { axiosClient } from '../axiosClient';

export const getUser = async (userId: number) => {
	const response = await axiosClient.get<User>(`/users/${userId}`);
	return response.data;
};
