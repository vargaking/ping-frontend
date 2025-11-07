import { axiosClient } from '../axiosClient';

export const createChannel = async (server_id: number, server_name: string): Promise<void> => {
	const response = await axiosClient.post(
		`/channels/${server_id}/create?channel_name=${server_name}`
	);
	return response.data;
};
