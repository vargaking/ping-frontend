import { getConversations } from '$lib/requests/conversations/getConversations';
import { openConversation } from '$lib/requests/conversations/openConversation';
import type { Conversation } from '$lib/types/conversation.types';
import type { MessageType } from '$lib/types/messages.types';
import { timestampMs } from '$lib/utils/messageContent';
import { usersState } from './usersState.svelte';

const LAST_ACTIVE_KEY = 'dm:last-active';

class ConversationsState {
	conversations: Record<number, Conversation> = $state({});
	loaded = $state(false);
	loadFailed = $state(false);

	/** Most recently active first. */
	list: Conversation[] = $derived(
		Object.values(this.conversations).sort(
			(a, b) => timestampMs(b.last_activity) - timestampMs(a.last_activity)
		)
	);

	// Seed the user cache so message rows don't refetch the other person.
	private seedUser(conversation: Conversation) {
		if (!usersState.users[conversation.other_user.id]) {
			usersState.users[conversation.other_user.id] = conversation.other_user;
		}
	}

	async fetch() {
		try {
			const fetched = await getConversations();
			// Swap in one assignment so a refresh never flashes an empty list.
			this.conversations = Object.fromEntries(fetched.map((c) => [c.id, c]));
			fetched.forEach((c) => this.seedUser(c));
			this.loadFailed = false;
		} catch (e) {
			console.error('Failed to load conversations', e);
			this.loadFailed = true;
		} finally {
			this.loaded = true;
		}
	}

	/** Open (get-or-create) the conversation with a user. */
	async openWith(userId: number): Promise<Conversation> {
		const conversation = await openConversation(userId);
		this.conversations[conversation.id] = conversation;
		this.seedUser(conversation);
		return conversation;
	}

	/** Move a conversation to the top with this message as its preview. */
	noteMessage(message: MessageType) {
		const id = message.conversation_id;
		if (id == null) return;

		const conversation = this.conversations[id];
		if (!conversation) {
			// Someone started a conversation we don't know about yet.
			if (this.loaded) this.fetch();
			return;
		}

		this.conversations[id] = {
			...conversation,
			last_message: {
				id: message.id,
				content: message.content,
				user_id: message.user_id,
				timestamp: message.timestamp,
				edited_at: message.edited_at
			},
			last_activity: message.timestamp
		};
	}

	/** Keep a preview in step when the message it shows is edited. */
	messageEdited(id: string, changes: Pick<MessageType, 'content' | 'edited_at'>) {
		for (const conversation of Object.values(this.conversations)) {
			if (conversation.last_message?.id === id) {
				this.conversations[conversation.id] = {
					...conversation,
					last_message: { ...conversation.last_message, ...changes }
				};
				return;
			}
		}
	}

	/** The previewed message was deleted: refetch to preview the one before it. */
	messageDeleted(id: string) {
		if (Object.values(this.conversations).some((c) => c.last_message?.id === id)) this.fetch();
	}

	/** Drop a conversation that turned out to be gone or not ours. */
	forget(id: number) {
		delete this.conversations[id];
		if (this.lastActiveId === id) this.setLastActive(null);
	}

	/** The last DM the user had open, remembered across reloads. */
	get lastActiveId(): number | null {
		try {
			const raw = localStorage.getItem(LAST_ACTIVE_KEY);
			return raw ? parseInt(raw) : null;
		} catch {
			return null;
		}
	}

	setLastActive(id: number | null) {
		try {
			if (id == null) localStorage.removeItem(LAST_ACTIVE_KEY);
			else localStorage.setItem(LAST_ACTIVE_KEY, String(id));
		} catch {
			// Storage unavailable: /app just falls back to the most recent DM.
		}
	}

	reset() {
		this.conversations = {};
		this.loaded = false;
		this.loadFailed = false;
		this.setLastActive(null);
	}
}

export const conversationsState = new ConversationsState();
