import type { JSONContent } from '@tiptap/core';
import type { Attachment } from './attachment.types';

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
	attachments?: Attachment[];
	reactions?: Reaction[];
	reply_to?: ReplyRef | null;
	embeds?: Embed[];
};

/** Link preview. Sender-provided, so only `url` says where the card really goes. */
export type Embed = {
	url: string;
	site_name: string | null;
	title: string | null;
	description: string | null;
	image_url: string | null;
};

export type ReplyRef =
	| { id: string; user_id: number; preview: string; deleted?: false }
	| { id: string; deleted: true };

export type Reaction = { emoji: string; user_ids: number[] };

/** Where a composed message goes: a server channel or a DM conversation. */
export type MessageTarget =
	| { kind: 'channel'; serverId: number; channelId: number }
	| { kind: 'direct'; conversationId: number };
