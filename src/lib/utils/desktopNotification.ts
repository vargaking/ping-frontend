import { goto } from '$app/navigation';
import { messagePlainText } from './messageContent';

const BODY_LIMIT = 140;

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
		const notification = new Notification(opts.title, { body: truncate(opts.body), tag: opts.tag });
		notification.onclick = () => {
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
	href: string;
}) {
	notify({
		tag: opts.tag,
		title: `#${opts.channelName} · ${opts.serverName}`,
		body: `${opts.senderUsername}: ${messagePlainText(opts.content)}`,
		href: opts.href
	});
}

/** DM: title is just the sender's username. */
export function notifyDirectMessage(opts: {
	tag: string;
	senderUsername: string;
	content: unknown;
	href: string;
}) {
	notify({
		tag: opts.tag,
		title: opts.senderUsername,
		body: messagePlainText(opts.content),
		href: opts.href
	});
}
