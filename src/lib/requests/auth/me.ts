import { axiosClient } from '../axiosClient';

export const getMe = async () => {
	const response = await axiosClient.get('/auth/me');
	return response.data;
};
