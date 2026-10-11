import type { ForumPost } from './forum.types';
import type { MessageType } from './messages.types';

/** A message as kept on the device: `ts`, `words` and the search facets are derived on every write. */
export type StoredMessage = MessageType & {
	/** `timestamp` in ms, so threads sort and range-query as numbers. */
	ts?: number;
	/** Normalized search words from the text and attachment file names. */
	words?: string[];
	/** Who `from:` matches: `user:<user_id>`, or `name:<normalized name>` for an imported author. */
	fromKey?: string;
	/** 1 when true, absent otherwise, so each `[has*+ts]` index holds only matching rows. */
	hasFile?: 1;
	hasImage?: 1;
	hasVideo?: 1;
	hasLink?: 1;
};

export type StoredPost = ForumPost & { server_id: number; words: string[] };

/** How far the local copy of one thread has been downloaded. */
export type ThreadSync = {
	/** threadKey() of the thread. */
	key: string;
	serverId: number | null;
	channelId: number | null;
	/** Ids at the top of the thread when it was last caught up, newest first. */
	head: string[];
	/** last_message_id or last_activity_at from the listing when last caught up. */
	marker: string | null;
	/** Where the walk towards the oldest message continues. */
	olderCursor: string | null;
	complete: boolean;
	/** Import revision of the channel when this thread was walked; null for DMs and channels never imported into. Absent on older rows. */
	rev?: number | null;
};
