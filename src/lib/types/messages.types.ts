import type { JSONContent } from '@tiptap/core';

export type MessageType = {
	id: string;
	user_id: number;
	content: JSONContent;
	timestamp: string;
	// Channel messages carry server_id/channel_id; direct messages carry
	// conversation_id instead.
	server_id?: number | null;
	channel_id?: number | null;
	conversation_id?: number | null;
	edited_at?: string | null;
};

/** Where a composed message goes: a server channel or a DM conversation. */
export type MessageTarget =
	| { kind: 'channel'; serverId: number; channelId: number }
	| { kind: 'direct'; conversationId: number };
