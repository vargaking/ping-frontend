import type { User } from '$lib/types/auth.types';
import { axiosClient } from '../axiosClient';

export const removeBanner = async (userId: number) => {
	const response = await axiosClient.delete<User>(`/users/${userId}/banner`);
	return response.data;
};
