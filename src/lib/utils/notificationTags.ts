export const dmTag = (conversationId: number) => `dm-${conversationId}`;
export const channelTag = (channelId: number) => `ch-${channelId}`;

export type NotificationData = {
	url: string;
	count: number;
	messageUuid?: string;
	shownAt?: number;
};

type Shown = { tag: string; data?: unknown };

/** Shown notifications for a tag. WebKit ignores the `{ tag }` filter and stacks
 *  same-tag notifications, so callers list everything and match here. */
export function withTag<T extends Shown>(shown: T[], tag: string): T[] {
	return shown.filter((notification) => notification.tag === tag);
}

function dataOf(notification: Shown): Partial<NotificationData> | undefined {
	return notification.data as Partial<NotificationData> | undefined;
}

/** DMs show the unread count; mentions have none, so they count up from the tray. */
export function threadNotificationCount(opts: {
	unread?: number;
	previous: Shown[];
	messageUuid?: string;
}): { count: number; alreadyShown: boolean } {
	const { unread, previous, messageUuid } = opts;
	const alreadyShown =
		!!messageUuid &&
		previous.some((notification) => dataOf(notification)?.messageUuid === messageUuid);
	if (unread != null) return { count: Math.max(1, unread), alreadyShown };
	const trayCount = Math.max(
		0,
		...previous.map((notification) => dataOf(notification)?.count ?? 0)
	);
	return { count: Math.max(1, trayCount + (alreadyShown ? 0 : 1)), alreadyShown };
}
