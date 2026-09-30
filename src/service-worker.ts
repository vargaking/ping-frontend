/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Push only: no fetch handler and no caching, so the app's network behaviour is untouched.
import { PUBLIC_BASE_URL } from '$env/static/public';
import { readPushPrefs } from '$lib/utils/pushPrefs';

const sw = self as unknown as ServiceWorkerGlobalScope;

type PushPayload = {
	v: number;
	kind: 'dm' | 'mention' | 'read';
	tag: string;
	title?: string;
	body?: string;
	url?: string;
	count?: number;
};

type NotificationData = { url: string; count: number };

type SubscriptionChangeEvent = ExtendableEvent & {
	oldSubscription?: PushSubscription | null;
	newSubscription?: PushSubscription | null;
};

const ICON = '/icon-192.png';

function readPayload(event: PushEvent): PushPayload | null {
	try {
		const payload = event.data?.json();
		if (payload?.v !== 1 || typeof payload.tag !== 'string') return null;
		return payload;
	} catch {
		return null;
	}
}

function safePath(url: unknown): string {
	if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return '/app/';
	return url;
}

async function hasFocusedWindow(): Promise<boolean> {
	const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
	return windows.some((client) => client.visibilityState === 'visible' && client.focused);
}

async function handlePush(event: PushEvent) {
	const payload = readPayload(event);
	if (!payload) return;

	if (payload.kind === 'read') {
		const shown = await sw.registration.getNotifications({ tag: payload.tag });
		shown.forEach((notification) => notification.close());
		return;
	}
	if (payload.kind !== 'dm' && payload.kind !== 'mention') return;

	// The open tab shows its own notifications.
	if (await hasFocusedWindow()) return;

	const [existing] = await sw.registration.getNotifications({ tag: payload.tag });
	const previous = (existing?.data as NotificationData | undefined)?.count ?? 0;
	const count = Math.max(payload.count ?? 1, previous + 1);
	const noun = payload.kind === 'dm' ? 'messages' : 'mentions';
	const prefs = await readPushPrefs();

	await sw.registration.showNotification(payload.title ?? 'zeta', {
		body: count > 1 ? `${count} new ${noun}` : (payload.body ?? ''),
		tag: payload.tag,
		icon: ICON,
		silent: !prefs.sound,
		data: { url: safePath(payload.url), count } satisfies NotificationData,
		// Not in the DOM typings yet, but Chrome and Firefox honour it.
		...({ renotify: true } as object)
	});
}

async function openThread(path: string) {
	const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
	const ours = windows.filter((client) => new URL(client.url).origin === sw.location.origin);
	const target = ours.find((client) => client.focused) ?? ours[0];
	if (!target) {
		await sw.clients.openWindow(path);
		return;
	}
	await target.focus();
	target.postMessage({ type: 'navigate', url: path });
}

async function resubscribe(event: SubscriptionChangeEvent) {
	try {
		const subscription =
			event.newSubscription ??
			(await sw.registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: event.oldSubscription?.options.applicationServerKey
			}));
		await fetch(`${PUBLIC_BASE_URL}/api/push/subscriptions`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(subscription.toJSON())
		});
	} catch {
		// Best effort: the app re-registers the subscription the next time it opens.
	}
}

sw.addEventListener('install', () => void sw.skipWaiting());

// Pushes are handled one at a time so a burst merges into one notification
// instead of each seeing an empty tray.
let pushQueue: Promise<void> = Promise.resolve();

sw.addEventListener('push', (event) => {
	const run = pushQueue.then(() => handlePush(event));
	pushQueue = run.catch(() => {});
	event.waitUntil(run);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const data = event.notification.data as Partial<NotificationData> | undefined;
	event.waitUntil(openThread(safePath(data?.url)));
});

sw.addEventListener('pushsubscriptionchange', (event) =>
	event.waitUntil(resubscribe(event as SubscriptionChangeEvent))
);
