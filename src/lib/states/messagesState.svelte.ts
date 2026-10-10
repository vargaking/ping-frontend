import type { MessageType, Reaction, ReplyRef } from '$lib/types/messages.types';
import { timestampMs } from '$lib/utils/messageContent';
import { replaceWithNewestPage } from '$lib/utils/mergeNewestPage';
import { channelThreadKey, directThreadKey, postThreadKey } from '$lib/utils/threadKeys';

export { channelThreadKey, directThreadKey, postThreadKey, threadKey } from '$lib/utils/threadKeys';

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
	/** The loaded messages stop short of the newest ones, with a gap in between. */
	newerExists?: boolean;
	/** Set while the newest page is being fetched over the gap. */
	newestLoad?: {
		/** Server messages that arrived meanwhile. */
		arrived: MessageType[];
		/** Sent messages loaded when the fetch began. */
		known: Set<string>;
	};
};

function listsOf(thread: ThreadMessages): MessageType[][] {
	return thread.newestLoad ? [thread.messages, thread.newestLoad.arrived] : [thread.messages];
}

/** Server messages by time (those held in the window and those that arrived), then unsent ones. */
function inArrivalOrder(held: MessageType[], arrived: MessageType[]): MessageType[] {
	const all = [...held, ...arrived];
	const sent = all
		.filter((m) => !m.status)
		.sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp));
	return [...sent, ...all.filter((m) => m.status)];
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

	newerExists(key: string): boolean {
		return this.threads[key]?.newerExists ?? false;
	}

	/** The loaded window isn't the newest page: live messages wait until it is. */
	markNewerExists(key: string) {
		const thread = this.threads[key];
		if (thread) thread.newerExists = true;
	}

	/** Past a gap, keep the messages that arrive while the newest page loads instead of dropping them. */
	beginNewestLoad(key: string) {
		const thread = this.threads[key];
		if (!thread?.newerExists) return;
		thread.newestLoad = {
			arrived: [],
			known: new Set(thread.messages.filter((m) => !m.status).map((m) => m.id))
		};
	}

	endNewestLoad(key: string) {
		const thread = this.threads[key];
		if (thread) thread.newestLoad = undefined;
	}

	/** Replace a thread's list with a freshly loaded newest page. What arrived while it
	 *  loaded and our unsent messages aren't on it, so they stay after it. */
	set(key: string, messages: MessageType[], hasMore: boolean) {
		const thread = this.threads[key];
		const current = thread?.newestLoad
			? inArrivalOrder(thread.messages, thread.newestLoad.arrived)
			: (thread?.messages ?? []);
		const known =
			thread?.newestLoad?.known ?? new Set(current.filter((m) => !m.status).map((m) => m.id));
		this.threads[key] = { messages: replaceWithNewestPage(current, messages, known), hasMore };
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
		if (thread.newerExists && !message.status) {
			// Past a gap, server messages come with the newest page; our unsent ones must still show.
			const { newestLoad } = thread;
			if (newestLoad && !newestLoad.arrived.some((m) => m.id === message.id)) {
				newestLoad.arrived.push(message);
			}
			return;
		}
		thread.messages.push(message);
	}

	updateMessage(id: string, changes: Partial<MessageType>) {
		for (const thread of Object.values(this.threads)) {
			for (const list of listsOf(thread)) {
				const i = list.findIndex((m) => m.id === id);
				if (i !== -1) {
					list[i] = { ...list[i], ...changes };
					return;
				}
			}
		}
	}

	applyReaction(id: string, emoji: string, userId: number, added: boolean) {
		for (const thread of Object.values(this.threads)) {
			for (const list of listsOf(thread)) {
				const message = list.find((m) => m.id === id);
				if (message) {
					message.reactions = reactionsWith(message.reactions, emoji, userId, added);
					return;
				}
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
			for (const list of listsOf(thread)) {
				const i = list.findIndex((m) => m.id === id);
				if (i !== -1) {
					list.splice(i, 1);
					return;
				}
			}
		}
	}
}

export const messagesState = new MessagesState();
