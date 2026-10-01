import { axiosClient } from '../axiosClient';

const reactionPath = (messageId: string, emoji: string) =>
	`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`;

export const addReaction = async (messageId: string, emoji: string): Promise<void> => {
	await axiosClient.put(reactionPath(messageId, emoji));
};

export const removeReaction = async (messageId: string, emoji: string): Promise<void> => {
	await axiosClient.delete(reactionPath(messageId, emoji));
};
