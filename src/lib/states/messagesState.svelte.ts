import type { MessageType } from '$lib/types/messages.types';

type ChannelMessages = {
	messages: MessageType[];
	hasMore: boolean;
};

/**
 * Messages are kept per channel: each channel has its own list (oldest first)
 * and a hasMore flag telling whether older history can still be loaded.
 */
class MessagesState {
	private channels = $state<Record<number, ChannelMessages>>({});

	private ensure(channelId: number): ChannelMessages {
		if (!this.channels[channelId]) {
			this.channels[channelId] = { messages: [], hasMore: false };
		}
		return this.channels[channelId];
	}

	messages(channelId: number): MessageType[] {
		return this.channels[channelId]?.messages ?? [];
	}

	hasMore(channelId: number): boolean {
		return this.channels[channelId]?.hasMore ?? false;
	}

	/** Replace a channel's list with a freshly loaded newest page. */
	set(channelId: number, messages: MessageType[], hasMore: boolean) {
		this.channels[channelId] = { messages, hasMore };
	}

	/** Prepend an older page (oldest first) ahead of what's already loaded. */
	prependOlder(channelId: number, older: MessageType[], hasMore: boolean) {
		const channel = this.ensure(channelId);
		channel.messages = [...older, ...channel.messages];
		channel.hasMore = hasMore;
	}

	clear(channelId: number) {
		this.channels[channelId] = { messages: [], hasMore: false };
	}

	/** Drop every channel's messages (session teardown). */
	clearAll() {
		this.channels = {};
	}

	addMessage(message: MessageType) {
		const channel = this.ensure(message.channel_id);
		if (channel.messages.some((m) => m.id === message.id)) return;
		channel.messages.push(message);
	}
}

export const messagesState = new MessagesState();
