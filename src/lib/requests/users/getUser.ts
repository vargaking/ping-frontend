import { axiosClient } from '../axiosClient';

export const getUser = async (userId: number) => {
	const response = await axiosClient.get(`/users/${userId}`);
	return response.data;
};
