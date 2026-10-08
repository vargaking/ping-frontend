type BadgeNavigator = {
	setAppBadge?: (count: number) => Promise<void>;
	clearAppBadge?: () => Promise<void>;
};

/** Shows a count on the installed app's icon; 0 clears it. Also used by the
 *  service worker, where `navigator` is the worker's own. */
export function setAppBadge(count: number): void {
	const nav = navigator as unknown as BadgeNavigator;
	Promise.resolve()
		.then(() => (count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.()))
		.catch(() => {
			// A badge is a nicety: some platforms refuse it until notifications are allowed.
		});
}

/** What the icon should show for notifications still in the tray; `closedTag`
 *  is one that was just closed and may not have left the list yet. */
export function notificationBadgeCount(
	shown: { tag: string; data?: unknown }[],
	closedTag?: string
): number {
	return shown
		.filter((notification) => notification.tag !== closedTag)
		.reduce((sum, notification) => {
			const count = (notification.data as { count?: unknown } | undefined)?.count;
			return sum + (typeof count === 'number' ? count : 0);
		}, 0);
}
