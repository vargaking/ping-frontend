import type { JSONContent } from '@tiptap/core';
import type { User } from './auth.types';

export type ConversationPreview = {
	id: string;
	/** JSON text from the API, or a parsed doc when patched in from the socket. */
	content: string | JSONContent;
	user_id: number;
	timestamp: string;
	edited_at?: string | null;
};

export type Conversation = {
	id: number;
	created_at: string;
	/** The participant who isn't the current user. */
	other_user: User;
	last_message: ConversationPreview | null;
	last_activity: string;
	/** Message uuids, null when nothing has been read/sent yet. */
	last_read_message_id?: string | null;
	last_message_id?: string | null;
	/** Messages after the marker not authored by us. */
	unread_count?: number;
};
