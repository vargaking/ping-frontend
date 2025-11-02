import { axiosClient } from '../axiosClient';

export const login = async (username: string, password: string) => {
	const response = await axiosClient.post('/auth/login', {
		username,
		password
	});
	return response.data;
};
