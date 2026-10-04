import type { JSONContent } from '@tiptap/core';
import type { Attachment } from './attachment.types';
import type { Embed, MessageType } from './messages.types';

export type ForumTag = {
	id: number;
	channel_id: number;
	name: string;
	color: string | null;
	position: number;
};

export type ForumThumbnail =
	| { type: 'image'; attachment: Attachment }
	| { type: 'video'; attachment: Attachment }
	| { type: 'embed'; url: string };

export type ForumPost = {
	id: number;
	channel_id: number;
	title: string;
	author_id: number | null;
	tag_ids: number[];
	pinned: boolean;
	locked: boolean;
	reply_count: number;
	created_at: string;
	last_activity_at: string;
	thumbnail: ForumThumbnail | null;
};

export type ForumPostDetail = ForumPost & { opening_message_id: string | null };

export type ForumPostPage = {
	posts: ForumPost[];
	next_cursor: string | null;
};

export type ForumPostUpdate = {
	title?: string;
	tag_ids?: number[];
	pinned?: boolean;
	locked?: boolean;
};

export type ForumPostCreate = {
	title: string;
	tag_ids: number[];
	message: {
		id: string;
		content: JSONContent;
		timestamp: string;
		attachment_ids: string[];
		embeds: Embed[];
	};
};

export type ForumPostCreated = { post: ForumPost; message: MessageType };

export const POST_TITLE_MAX = 200;
export const POST_TAGS_MAX = 5;
export const TAG_NAME_MAX = 30;
export const TAGS_PER_CHANNEL_MAX = 20;
