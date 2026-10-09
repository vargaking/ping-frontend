import { goto } from '$app/navigation';
import { desktop } from '$lib/desktop';
import type { Attachment } from '$lib/types/attachment.types';
import { messagePreviewText } from './messageContent';
import { threadNotificationCount, withTag, type NotificationData } from './notificationTags';

const BODY_LIMIT = 140;
const ICON = '/icon-192.png';

function truncate(text: string): string {
	return text.length > BODY_LIMIT ? `${text.slice(0, BODY_LIMIT).trimEnd()}…` : text;
}

type NotifyOptions = {
	/** Groups notifications for the same thread so a busy thread replaces
	 *  rather than stacks (also used as the notification tag). */
	tag: string;
	title: string;
	body: string;
	/** Path to open when the notification is clicked. */
	href: string;
};

/** Show a desktop Notification for an incoming message. Never throws — a
 *  blocked or failed notification (denied permission, unsupported browser,
 *  focus stolen) must never break message handling. */
function notify(opts: NotifyOptions) {
	try {
		const notification = new Notification(opts.title, {
			body: truncate(opts.body),
			tag: opts.tag,
			icon: ICON
		});
		notification.onclick = () => {
			desktop?.showWindow();
			window.focus();
			goto(opts.href);
			notification.close();
		};
	} catch (e) {
		console.warn('Failed to show desktop notification', e);
	}
}

/** Channel message: title "#channel · Server name", body "username: text". */
export function notifyChannelMessage(opts: {
	tag: string;
	channelName: string;
	serverName: string;
	senderUsername: string;
	content: unknown;
	attachments?: Attachment[];
	href: string;
}) {
	notify({
		tag: opts.tag,
		title: `#${opts.channelName} · ${opts.serverName}`,
		body: `${opts.senderUsername}: ${messagePreviewText(opts.content, opts.attachments)}`,
		href: opts.href
	});
}

/** DM or mention: shares a tag with the pushed notification, so whichever
 *  arrives second replaces the first instead of stacking. */
export async function showThreadNotification(opts: {
	tag: string;
	title: string;
	body: string;
	url: string;
	messageUuid: string;
	noun: 'messages' | 'mentions';
	/** The thread's unread count, for DMs. Mentions count up from the tray. */
	unread?: number;
}) {
	try {
		const registration = desktop ? undefined : await navigator.serviceWorker?.getRegistration();
		if (!registration) {
			notify({ tag: opts.tag, title: opts.title, body: opts.body, href: opts.url });
			return;
		}
		const previous = withTag(await registration.getNotifications(), opts.tag);
		const { count, alreadyShown } = threadNotificationCount({
			unread: opts.unread,
			previous,
			messageUuid: opts.messageUuid
		});
		if (alreadyShown) return;
		previous.forEach((notification) => notification.close());
		await registration.showNotification(opts.title, {
			body: count > 1 ? `${count} new ${opts.noun}` : truncate(opts.body),
			tag: opts.tag,
			icon: ICON,
			data: {
				url: opts.url,
				count,
				messageUuid: opts.messageUuid,
				shownAt: Date.now()
			} satisfies NotificationData,
			// Not in the DOM typings yet, but Chrome and Firefox honour it.
			...({ renotify: true } as object)
		});
	} catch (e) {
		console.warn('Failed to show desktop notification', e);
	}
}
