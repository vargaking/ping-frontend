import { AxiosError } from 'axios';
import { toast } from 'svelte-sonner';
import { db } from '$lib/utils/db';
import { messagesState, reactionsWith } from '$lib/states/messagesState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import { addReaction, removeReaction } from '$lib/requests/messages/reactions';
import type { MessageType } from '$lib/types/messages.types';

/** Apply a reaction change to the open thread and to the IndexedDB cache. */
export async function applyReaction(
	messageId: string,
	emoji: string,
	userId: number,
	added: boolean
) {
	messagesState.applyReaction(messageId, emoji, userId, added);
	const cached = await db.messages.get(messageId);
	if (cached) {
		const reactions = reactionsWith(cached.reactions, emoji, userId, added);
		if (reactions !== cached.reactions) await db.messages.update(messageId, { reactions });
	}
}

/** Toggle the logged-in user's reaction, optimistically; rolls back on failure. */
export async function toggleReaction(message: MessageType, emoji: string) {
	const me = usersState.loggedInUser;
	if (!me) return;
	const adding = !message.reactions?.some((r) => r.emoji === emoji && r.user_ids.includes(me.id));
	await applyReaction(message.id, emoji, me.id, adding);
	try {
		await (adding ? addReaction(message.id, emoji) : removeReaction(message.id, emoji));
	} catch (e) {
		await applyReaction(message.id, emoji, me.id, !adding);
		const detail = e instanceof AxiosError ? e.response?.data?.detail : undefined;
		toast.error(
			typeof detail === 'string' && detail.includes('Too many reactions')
				? 'This message has too many reactions.'
				: "Couldn't react."
		);
	}
}
