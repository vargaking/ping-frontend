import { axiosClient } from '../axiosClient';

export const createChannel = async (
	server_id: number,
	channel_name: string,
	type: 'text' | 'voice' = 'text'
): Promise<void> => {
	// Backend expects `channel_name` and `channel_type` query params
	// (see ping-server app/routers/channels.py::create_channel).
	const params = new URLSearchParams({ channel_name, channel_type: type });
	const response = await axiosClient.post(`/channels/${server_id}/create?${params.toString()}`);
	return response.data;
};
