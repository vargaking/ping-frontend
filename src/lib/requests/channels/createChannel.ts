import { axiosClient } from '../axiosClient';

export const createChannel = async (
	server_id: number,
	channel_name: string,
	type: 'text' | 'voice' = 'text'
): Promise<void> => {
	const response = await axiosClient.post(
		`/channels/${server_id}/create?channel_name=${channel_name}&type=${type}`
	);
	return response.data;
};
