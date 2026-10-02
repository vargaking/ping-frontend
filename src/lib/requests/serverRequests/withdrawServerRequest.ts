import { axiosClient } from '../axiosClient';

export const withdrawServerRequest = async (): Promise<void> => {
	await axiosClient.delete('/server-requests/me');
};
