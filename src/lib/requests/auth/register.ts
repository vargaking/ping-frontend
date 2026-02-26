import { axiosClient } from '../axiosClient';

export const register = async (username: string, password: string) => {
	const response = await axiosClient.post('/auth/register', {
		username,
		password
	});
	return response.data;
};
