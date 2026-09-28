import { axiosClient } from '../axiosClient';

export type ChannelReadResponse = {
	channel_id: number;
	server_id: number;
	last_read_message_id: string;
};

export const markChannelRead = async (
	channelId: number,
	messageId: string
): Promise<ChannelReadResponse> => {
	const response = await axiosClient.put(`/channels/${channelId}/read`, { message_id: messageId });
	return response.data;
};
