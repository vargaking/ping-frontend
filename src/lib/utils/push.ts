import { getPushConfig as fetchPushConfig } from '$lib/requests/push/getPushConfig';
import { subscribePush } from '$lib/requests/push/subscribePush';
import { unsubscribePush } from '$lib/requests/push/unsubscribePush';
import type { PushConfig, PushTestResult } from '$lib/types/push.types';
import { urlBase64ToBytes } from '$lib/utils/base64url';
import { desktop } from '$lib/desktop';

export type EnablePushResult = 'enabled' | 'denied' | 'dismissed' | 'unsupported' | 'error';

const READY_TIMEOUT_MS = 10000;
const SUBSCRIBE_TIMEOUT_MS = 30000;

/** A push service that can't be reached makes subscribe() hang rather than fail. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timed out')), ms))
	]);
}

/** Web Push isn't offered in the desktop app, which has no push service. iOS only
 *  exposes PushManager to an installed app, so the checks below cover it too. */
export function pushSupported(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !desktop
	);
}

/** Tell the service worker whether this window is active, so it can tell a
 *  pushed notification apart from one for a window the user is working in. */
export function reportActivity(state: 'active' | 'idle'): void {
	if (!pushSupported()) return;
	try {
		navigator.serviceWorker.controller?.postMessage({ type: 'activity', state });
	} catch {
		// Best effort: without a report the worker shows the push.
	}
}

let configPromise: Promise<PushConfig> | null = null;

/** Cached for the session; a failed fetch is not cached so the next call retries. */
export function getPushConfig(): Promise<PushConfig> {
	configPromise ??= fetchPushConfig().catch((e) => {
		configPromise = null;
		throw e;
	});
	return configPromise;
}

/** Resolves null when no service worker ever becomes ready, instead of hanging. */
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
	return Promise.race([
		navigator.serviceWorker.ready,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS))
	]);
}

/** Doesn't wait for a worker to activate, so it is quick when none is registered. */
export async function currentSubscription(): Promise<PushSubscription | null> {
	if (!pushSupported()) return null;
	try {
		const registration = await navigator.serviceWorker.getRegistration();
		return (await registration?.pushManager.getSubscription()) ?? null;
	} catch {
		return null;
	}
}

function sameKey(existing: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
	if (!existing) return false;
	const a = new Uint8Array(existing);
	return a.length === key.length && a.every((byte, i) => byte === key[i]);
}

/** A subscription made under an older server key is rejected by the push
 *  service, so swap it for one made with the current key. */
export async function ensureSubscriptionKey(
	subscription: PushSubscription,
	publicKey: string
): Promise<PushSubscription> {
	const current = subscription.options.applicationServerKey;
	const key = urlBase64ToBytes(publicKey);
	if (!current || sameKey(current, key)) return subscription;

	const registration = await readyRegistration();
	if (!registration) throw new Error('No service worker registration');
	await unsubscribePush(subscription.endpoint).catch((e) =>
		console.warn('[push] failed to remove the old subscription on the server', e)
	);
	await subscription.unsubscribe();
	const replacement = await withTimeout(
		registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }),
		SUBSCRIBE_TIMEOUT_MS
	);
	console.info('[push] re-subscribed with the current server key');
	return replacement;
}

export function describePushTestResult(r: PushTestResult): string {
	if (r.status === null) return `Failed: ${r.error ?? 'no response'}`;
	if (r.status >= 200 && r.status < 300) return 'Delivered';
	if (r.status === 401 || r.status === 403) return 'Rejected: key mismatch, turn push off and on';
	if (r.status === 404 || r.status === 410) return 'Subscription expired';
	return r.error ? `Status ${r.status}: ${r.error}` : `Status ${r.status}`;
}

/** Send a browser subscription to the server. Also used to re-claim an existing
 *  subscription after another account used this browser. */
export async function registerSubscription(subscription: PushSubscription): Promise<void> {
	const json = subscription.toJSON();
	if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
		throw new Error('Incomplete push subscription');
	await subscribePush({
		endpoint: json.endpoint,
		keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
	});
}

/** Must be called from a click: the permission prompt needs a user gesture, so
 *  nothing may be awaited before it. */
export async function enablePush(): Promise<EnablePushResult> {
	if (!pushSupported()) return 'unsupported';

	if (Notification.permission === 'default') {
		try {
			await Notification.requestPermission();
		} catch {
			return 'error';
		}
	}
	if (Notification.permission === 'denied') return 'denied';
	if (Notification.permission !== 'granted') return 'dismissed';

	try {
		const config = await getPushConfig();
		if (!config.enabled || !config.public_key) return 'error';

		const registration = await readyRegistration();
		if (!registration) return 'error';

		const key = urlBase64ToBytes(config.public_key);
		let subscription = await registration.pushManager.getSubscription();
		if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
			await subscription.unsubscribe();
			subscription = null;
		}
		subscription ??= await withTimeout(
			registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }),
			SUBSCRIBE_TIMEOUT_MS
		);

		try {
			await registerSubscription(subscription);
		} catch (e) {
			await subscription.unsubscribe().catch(() => {});
			throw e;
		}
		return 'enabled';
	} catch (e) {
		console.warn('Failed to enable push notifications', e);
		return 'error';
	}
}

/** Stop pushes for this browser: tell the server, then drop the browser
 *  subscription. The browser side is dropped even when the server call fails. */
export async function disablePush(): Promise<void> {
	const subscription = await currentSubscription();
	if (!subscription) return;
	try {
		await unsubscribePush(subscription.endpoint);
	} catch (e) {
		console.warn('Failed to remove push subscription on the server', e);
	}
	await subscription.unsubscribe().catch(() => {});
}

/** Drop only the browser subscription, for when the server already lost the account. */
export async function dropLocalSubscription(): Promise<void> {
	const subscription = await currentSubscription();
	await subscription?.unsubscribe().catch(() => {});
}
