import { axiosClient } from '../axiosClient';

export const deleteUser = async (userId: number) => {
	await axiosClient.delete(`/users/${userId}`);
};
