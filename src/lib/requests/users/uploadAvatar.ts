import type { User } from '$lib/types/auth.types';
import { axiosClient } from '../axiosClient';

export const uploadAvatar = async (userId: number, file: File) => {
	const formData = new FormData();
	formData.append('file', file);

	const response = await axiosClient.post<User>(`/users/${userId}/avatar`, formData, {
		headers: { 'Content-Type': 'multipart/form-data' }
	});
	return response.data;
};
