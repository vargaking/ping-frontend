import type { MessageType, ReplyRef } from '$lib/types/messages.types';
import { messagesState } from '$lib/states/messagesState.svelte';
import { db } from '$lib/utils/db';
import { messagePreviewText } from '$lib/utils/messageContent';

export function replyRefFor(message: MessageType): ReplyRef {
	return {
		id: message.id,
		user_id: message.user_id,
		imported_author: message.imported_author ?? null,
		preview: messagePreviewText(message.content, message.attachments)
	};
}

async function applyToReplies(originalId: string, ref: ReplyRef) {
	const ids = messagesState.updateReplyQuotes(originalId, ref);
	await Promise.all(ids.map((id) => db.messages.update(id, { reply_to: { ...ref } })));
}

/** The original was edited: refresh the quote shown on its loaded replies. */
export function refreshReplyQuotes(original: MessageType) {
	return applyToReplies(original.id, replyRefFor(original));
}

/** The original was deleted: its loaded replies show it as gone. */
export function markRepliesDeleted(originalId: string) {
	return applyToReplies(originalId, { id: originalId, deleted: true });
}
