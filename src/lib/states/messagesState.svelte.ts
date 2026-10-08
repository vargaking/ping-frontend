import type { MessageTarget, MessageType, Reaction, ReplyRef } from '$lib/types/messages.types';

/** Idempotent: adding an existing reaction or removing a missing one returns the input unchanged. */
export function reactionsWith(
	reactions: Reaction[] | undefined,
	emoji: string,
	userId: number,
	added: boolean
): Reaction[] {
	const current = reactions ?? [];
	const group = current.find((r) => r.emoji === emoji);
	if (added) {
		if (!group) return [...current, { emoji, user_ids: [userId] }];
		if (group.user_ids.includes(userId)) return current;
		return current.map((r) => (r === group ? { ...r, user_ids: [...r.user_ids, userId] } : r));
	}
	if (!group?.user_ids.includes(userId)) return current;
	const user_ids = group.user_ids.filter((id) => id !== userId);
	return user_ids.length === 0
		? current.filter((r) => r !== group)
		: current.map((r) => (r === group ? { ...r, user_ids } : r));
}

type ThreadMessages = {
	messages: MessageType[];
	hasMore: boolean;
};

/** Key for a message thread. Channels keep their bare id; DMs and posts are
 *  prefixed to avoid clashes with channel ids. */
export function channelThreadKey(channelId: number): string {
	return String(channelId);
}

/** A forum post's replies are their own thread, apart from the forum channel's id. */
export function postThreadKey(postId: number): string {
	return `post:${postId}`;
}

export function directThreadKey(conversationId: number): string {
	return `dm:${conversationId}`;
}

export function threadKey(target: MessageTarget): string {
	if (target.kind === 'direct') return directThreadKey(target.conversationId);
	return target.postId != null ? postThreadKey(target.postId) : channelThreadKey(target.channelId);
}

export function messageThreadKey(message: MessageType): string {
	if (message.conversation_id != null) return directThreadKey(message.conversation_id);
	if (message.post_id != null) return postThreadKey(message.post_id);
	return channelThreadKey(message.channel_id ?? -1);
}

/**
 * Messages are kept per thread (a channel, a forum post or a DM conversation): each has its
 * own list (oldest first) and a hasMore flag telling whether older history can
 * still be loaded.
 */
class MessagesState {
	private threads = $state<Record<string, ThreadMessages>>({});

	private ensure(key: string): ThreadMessages {
		if (!this.threads[key]) {
			this.threads[key] = { messages: [], hasMore: false };
		}
		return this.threads[key];
	}

	has(key: string): boolean {
		return key in this.threads;
	}

	messages(key: string): MessageType[] {
		return this.threads[key]?.messages ?? [];
	}

	hasMore(key: string): boolean {
		return this.threads[key]?.hasMore ?? false;
	}

	/** Replace a thread's list with a freshly loaded newest page. Our unsent
	 *  messages aren't on the server yet, so they stay after it. */
	set(key: string, messages: MessageType[], hasMore: boolean) {
		const unsent = (this.threads[key]?.messages ?? []).filter(
			(m) => m.status && !messages.some((loaded) => loaded.id === m.id)
		);
		this.threads[key] = { messages: [...messages, ...unsent], hasMore };
	}

	/** Swap in an already merged list as is. */
	replace(key: string, messages: MessageType[], hasMore: boolean) {
		this.threads[key] = { messages, hasMore };
	}

	/** Prepend an older page (oldest first) ahead of what's already loaded. */
	prependOlder(key: string, older: MessageType[], hasMore: boolean) {
		const thread = this.ensure(key);
		thread.messages = [...older, ...thread.messages];
		thread.hasMore = hasMore;
	}

	clear(key: string) {
		this.threads[key] = { messages: [], hasMore: false };
	}

	/** Drop every thread's messages (session teardown). */
	clearAll() {
		this.threads = {};
	}

	addMessage(message: MessageType) {
		const thread = this.ensure(messageThreadKey(message));
		if (thread.messages.some((m) => m.id === message.id)) return;
		thread.messages.push(message);
	}

	updateMessage(id: string, changes: Partial<MessageType>) {
		for (const thread of Object.values(this.threads)) {
			const i = thread.messages.findIndex((m) => m.id === id);
			if (i !== -1) {
				thread.messages[i] = { ...thread.messages[i], ...changes };
				return;
			}
		}
	}

	applyReaction(id: string, emoji: string, userId: number, added: boolean) {
		for (const thread of Object.values(this.threads)) {
			const message = thread.messages.find((m) => m.id === id);
			if (message) {
				message.reactions = reactionsWith(message.reactions, emoji, userId, added);
				return;
			}
		}
	}

	/** Point every loaded reply to *originalId* at *ref*; returns the replies' ids. */
	updateReplyQuotes(originalId: string, ref: ReplyRef): string[] {
		const updated: string[] = [];
		for (const thread of Object.values(this.threads)) {
			for (const message of thread.messages) {
				if (message.reply_to?.id !== originalId) continue;
				message.reply_to = { ...ref };
				updated.push(message.id);
			}
		}
		return updated;
	}

	removeMessage(id: string) {
		for (const thread of Object.values(this.threads)) {
			const i = thread.messages.findIndex((m) => m.id === id);
			if (i !== -1) {
				thread.messages.splice(i, 1);
				return;
			}
		}
	}
}

export const messagesState = new MessagesState();
