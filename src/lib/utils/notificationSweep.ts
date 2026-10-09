import { desktop } from '$lib/desktop';
import { conversationsState } from '$lib/states/conversationsState.svelte';
import { unreadState } from '$lib/states/unreadState.svelte';
import { db } from './db';
import { channelTag, dmTag, type NotificationData } from './notificationTags';

/** What the page knows about a notification's thread. */
export type ThreadReadView = {
	caughtUp: boolean;
	knows: (messageUuid: string) => boolean | Promise<boolean>;
};

/** Which shown notifications are for threads the page knows are read. A
 *  notification for a message the page can't place is kept: it may be brand new,
 *  ahead of a socket frame, unless it predates the fetch that said "read". */
export async function staleNotifications<T extends { tag: string; data?: unknown }>(
	shown: T[],
	view: (tag: string) => ThreadReadView | undefined,
	syncedAt?: number
): Promise<T[]> {
	const stale: T[] = [];
	for (const notification of shown) {
		const thread = view(notification.tag);
		if (!thread?.caughtUp) continue;
		const data = notification.data as Partial<NotificationData> | undefined;
		const messageUuid = data?.messageUuid;
		if (
			!messageUuid ||
			(syncedAt != null && (data?.shownAt ?? 0) <= syncedAt) ||
			(await thread.knows(messageUuid))
		) {
			stale.push(notification);
		}
	}
	return stale;
}

async function cachedMessageIn(
	messageUuid: string,
	field: 'conversation_id' | 'channel_id',
	id: number
): Promise<boolean> {
	return (await db.messages.get(messageUuid))?.[field] === id;
}

function threadReadView(tag: string): ThreadReadView | undefined {
	const match = /^(dm|ch)-(\d+)$/.exec(tag);
	if (!match) return undefined;
	const id = Number(match[2]);

	if (match[1] === 'dm') {
		const conversation = conversationsState.conversations[id];
		if (!conversation) return undefined;
		return {
			caughtUp: !conversationsState.isUnread(conversation),
			knows: (uuid) =>
				uuid === conversation.last_message_id ||
				uuid === conversation.last_read_message_id ||
				cachedMessageIn(uuid, 'conversation_id', id)
		};
	}

	if (!unreadState.channelKnown(id)) return undefined;
	return {
		caughtUp: !unreadState.channelUnread(id),
		knows: (uuid) =>
			uuid === unreadState.channelLastMessageId(id) ||
			uuid === unreadState.channelLastReadId(id) ||
			cachedMessageIn(uuid, 'channel_id', id)
	};
}

/** Tags of every thread with nothing unread, as one string so an effect can compare by value. */
export function readThreadTags(): string {
	const tags = [
		...Object.values(conversationsState.conversations)
			.filter((conversation) => !conversationsState.isUnread(conversation))
			.map((conversation) => dmTag(conversation.id)),
		...unreadState.readChannelIds().map(channelTag)
	];
	return tags.sort().join(',');
}

/** Close shown notifications whose thread is read. `syncedAt` is when the fetch
 *  that produced the current state started. Never throws. */
export async function closeReadNotifications(opts: { syncedAt?: number } = {}) {
	try {
		if (desktop) return;
		const registration = await navigator.serviceWorker?.getRegistration();
		if (!registration) return;
		const stale = await staleNotifications(
			await registration.getNotifications(),
			threadReadView,
			opts.syncedAt
		);
		stale.forEach((notification) => notification.close());
	} catch (e) {
		console.debug('Failed to close read notifications', e);
	}
}
