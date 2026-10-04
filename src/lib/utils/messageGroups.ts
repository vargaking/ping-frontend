import type { MessageType } from '$lib/types/messages.types';

export const GROUP_GAP_MS = 5 * 60 * 1000;

/** Identity a message is shown under: imported people are distinct from their shared owner account. */
export function authorKey(m: Pick<MessageType, 'user_id' | 'imported_author'>): string {
	return m.imported_author ? `imported:${m.imported_author.id}` : `user:${m.user_id}`;
}

/** Whether `m` continues a run of messages that ends with `last`. */
export function continuesGroup(last: MessageType, m: MessageType): boolean {
	return (
		authorKey(last) === authorKey(m) &&
		!m.reply_to &&
		new Date(m.timestamp).getTime() - new Date(last.timestamp).getTime() < GROUP_GAP_MS
	);
}
