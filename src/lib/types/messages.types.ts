import type { JSONContent } from '@tiptap/core';

export type MessageType = {
	id: string;
	user_id: number;
	content: JSONContent;
	timestamp: string;
	server_id: number;
	channel_id: number;
};
