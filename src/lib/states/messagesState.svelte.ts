import type { MessageTarget, MessageType } from '$lib/types/messages.types';

type ThreadMessages = {
	messages: MessageType[];
	hasMore: boolean;
};

/** Key for a message thread. Channels keep their bare id so existing
 *  `read:<channelId>` markers carry over; DMs are prefixed to avoid clashes. */
export function channelThreadKey(channelId: number): string {
	return String(channelId);
}

export function directThreadKey(conversationId: number): string {
	return `dm:${conversationId}`;
}

export function threadKey(target: MessageTarget): string {
	return target.kind === 'channel'
		? channelThreadKey(target.channelId)
		: directThreadKey(target.conversationId);
}

export function messageThreadKey(message: MessageType): string {
	return message.conversation_id != null
		? directThreadKey(message.conversation_id)
		: channelThreadKey(message.channel_id ?? -1);
}

/**
 * Messages are kept per thread (a channel or a DM conversation): each has its
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

	/** Replace a thread's list with a freshly loaded newest page. */
	set(key: string, messages: MessageType[], hasMore: boolean) {
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
