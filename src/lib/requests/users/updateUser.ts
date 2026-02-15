import type { User } from '$lib/types/auth.types';
import { axiosClient } from '../axiosClient';

export const updateUser = async (user: User) => {
	const { id, ...data } = user;
	const response = await axiosClient.put<User>(`/users/${id}`, data);
	return response.data;
};
