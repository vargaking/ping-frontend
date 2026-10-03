/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Push, plus a precached app shell so the app can start without a network.
import { build, files, version } from '$service-worker';
import { PUBLIC_BASE_URL } from '$env/static/public';
import { urlBase64ToBytes } from '$lib/utils/base64url';
import type { NotificationData } from '$lib/utils/notificationTags';
import { readPushPrefs } from '$lib/utils/pushPrefs';

const sw = self as unknown as ServiceWorkerGlobalScope;

type PushPayload = {
	v: number;
	kind: 'dm' | 'mention' | 'server_request' | 'read';
	tag: string;
	title?: string;
	body?: string;
	url?: string;
	count?: number;
	message_uuid?: string;
};

type SubscriptionChangeEvent = ExtendableEvent & {
	oldSubscription?: PushSubscription | null;
	newSubscription?: PushSubscription | null;
};

const ICON = '/icon-192.png';

const CACHE = `shell-${version}`;
// Every app route has ssr off, so any app page's HTML is the same empty shell.
const SHELL = '/app/';
const PRECACHED = new Set([...build, ...files]);

type ParsedPayload = { ok: true; payload: PushPayload } | { ok: false; reason: string };

function parsePayload(event: PushEvent): ParsedPayload {
	const text = event.data?.text();
	if (!text) return { ok: false, reason: 'empty' };
	let payload;
	try {
		payload = JSON.parse(text);
	} catch {
		return { ok: false, reason: 'bad JSON' };
	}
	if (payload?.v !== 1) return { ok: false, reason: 'wrong v' };
	if (typeof payload.tag !== 'string' || !payload.tag) return { ok: false, reason: 'no tag' };
	if (!['dm', 'mention', 'server_request', 'read'].includes(payload.kind))
		return { ok: false, reason: 'unknown kind' };
	return { ok: true, payload };
}

async function showGeneric() {
	await sw.registration.showNotification('New activity on Zeta', {
		body: '',
		tag: 'zeta-generic',
		icon: ICON,
		data: { url: '/app/', count: 1 } satisfies NotificationData
	});
	console.debug('[push] shown: zeta-generic');
}

function safePath(url: unknown): string {
	if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return '/app/';
	return url;
}

const activity = new Map<string, 'active' | 'idle'>();

sw.addEventListener('message', (event) => {
	const source = event.source;
	if (!source || !('id' in source)) return;
	const { type, state } = event.data ?? {};
	if (type !== 'activity' || (state !== 'active' && state !== 'idle')) return;
	activity.set(source.id, state);
});

async function hasActiveWindow(): Promise<boolean> {
	const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
	return windows.some(
		(client) =>
			client.visibilityState === 'visible' && client.focused && activity.get(client.id) === 'active'
	);
}

async function handlePush(event: PushEvent) {
	console.debug(`[push] received (payload: ${event.data ? 'yes' : 'no'})`);
	const parsed = parsePayload(event);
	if (!parsed.ok) {
		console.debug(`[push] rejected: ${parsed.reason}`);
		await showGeneric();
		return;
	}
	const { payload } = parsed;

	if (payload.kind === 'read') {
		const shown = await sw.registration.getNotifications({ tag: payload.tag });
		shown.forEach((notification) => notification.close());
		console.debug(`[push] closed: ${payload.tag}`);
		return;
	}

	// A window the user is working in shows its own notifications.
	if (await hasActiveWindow()) {
		console.debug('[push] skipped: active window');
		return;
	}

	const [existing] = await sw.registration.getNotifications({ tag: payload.tag });
	const previousData = existing?.data as NotificationData | undefined;
	const messageUuid = typeof payload.message_uuid === 'string' ? payload.message_uuid : undefined;
	if (messageUuid && previousData?.messageUuid === messageUuid) {
		console.debug(`[push] skipped: already shown ${payload.tag}`);
		return;
	}
	const count = Math.max(payload.count ?? 1, (previousData?.count ?? 0) + 1);
	const noun = payload.kind === 'dm' ? 'messages' : 'mentions';
	const summarize = count > 1 && payload.kind !== 'server_request';
	const prefs = await readPushPrefs();

	await sw.registration.showNotification(payload.title ?? 'zeta', {
		body: summarize ? `${count} new ${noun}` : (payload.body ?? ''),
		tag: payload.tag,
		icon: ICON,
		silent: !prefs.sound,
		data: { url: safePath(payload.url), count, messageUuid } satisfies NotificationData,
		// Not in the DOM typings yet, but Chrome and Firefox honour it.
		...({ renotify: true } as object)
	});
	console.debug(`[push] shown: ${payload.tag}`);
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

async function applicationServerKey(event: SubscriptionChangeEvent) {
	const old = event.oldSubscription?.options.applicationServerKey;
	if (old) return old;
	const res = await fetch(`${PUBLIC_BASE_URL}/api/push/config`, {
		credentials: 'include',
		headers: { 'ngrok-skip-browser-warning': 'true' }
	});
	if (!res.ok) throw new Error(`config request returned ${res.status}`);
	const { public_key } = await res.json();
	if (typeof public_key !== 'string') throw new Error('config has no public key');
	return urlBase64ToBytes(public_key);
}

async function resubscribe(event: SubscriptionChangeEvent) {
	try {
		const subscription =
			event.newSubscription ??
			(await sw.registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: await applicationServerKey(event)
			}));
		const res = await fetch(`${PUBLIC_BASE_URL}/api/push/subscriptions`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
			body: JSON.stringify(subscription.toJSON())
		});
		if (!res.ok) console.warn('[push] resubscribe failed', res.status);
	} catch (e) {
		console.warn('[push] resubscribe failed', e);
	}
}

async function precache() {
	const cache = await caches.open(CACHE);
	// One failed file must not block the worker update; push depends on it.
	await Promise.allSettled([SHELL, ...PRECACHED].map((path) => cache.add(path)));
}

async function dropOldCaches() {
	const keys = await caches.keys();
	await Promise.all(
		keys.filter((key) => key.startsWith('shell-') && key !== CACHE).map((key) => caches.delete(key))
	);
}

async function navigate(request: Request): Promise<Response> {
	try {
		return await fetch(request);
	} catch (e) {
		const shell = await caches.match(SHELL);
		if (shell) return shell;
		throw e;
	}
}

async function cacheFirst(request: Request): Promise<Response> {
	return (await caches.match(request)) ?? fetch(request);
}

sw.addEventListener('install', (event) => {
	event.waitUntil(precache().then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => event.waitUntil(dropOldCaches()));

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (request.mode === 'navigate') {
		if (url.pathname.startsWith('/invite/')) return;
		event.respondWith(navigate(request));
	} else if (PRECACHED.has(url.pathname)) {
		event.respondWith(cacheFirst(request));
	}
});

// Pushes are handled one at a time so a burst merges into one notification
// instead of each seeing an empty tray.
let pushQueue: Promise<void> = Promise.resolve();

sw.addEventListener('push', (event) => {
	const run = pushQueue.then(() => handlePush(event));
	pushQueue = run.catch((e) => console.warn('[push] handler failed', e));
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
