import { goto } from '$app/navigation';
import { usersState } from '$lib/states/usersState.svelte';
import { serversState } from '$lib/states/serversState.svelte';
import { messagesState } from '$lib/states/messagesState.svelte';
import { conversationsState } from '$lib/states/conversationsState.svelte';
import { unreadState } from '$lib/states/unreadState.svelte';
import { notificationsState } from '$lib/states/notificationsState.svelte';
import { socketState } from '$lib/states/socketState.svelte';
import { clearLocalCache } from '$lib/utils/db';
import { disablePush } from '$lib/utils/push';
import { logout as logoutRequest } from '$lib/requests/auth/logout';

/**
 * Tear down all client-side session state: close the socket, empty the in-memory
 * stores, and clear the local cache. Shared by an explicit logout and by the 401
 * interceptor so a dropped session and a deliberate logout both leave the app in
 * exactly the same clean state before we route back to /login.
 */
export async function clearSession(): Promise<void> {
	socketState.disconnect();

	usersState.reset();

	serversState.reset();

	messagesState.clearAll();
	conversationsState.reset();
	unreadState.reset();
	notificationsState.resetPush();

	try {
		await clearLocalCache();
	} catch (e) {
		console.warn('Failed to clear local cache during session teardown', e);
	}
}

/**
 * Full logout: close the socket, remove the push subscription, tell the server to drop the session, wipe local state, and land
 * on /login. The cookie is cleared server-side even if the request fails, so we
 * always tear down and redirect regardless.
 */
export async function logout(): Promise<void> {
	// First, so the user goes offline right away instead of after the slower
	// push and logout requests below.
	socketState.disconnect();
	// Needs the session cookie, so it has to come before the logout request.
	// Otherwise the next account on this browser would receive these pushes.
	try {
		await disablePush();
	} catch (e) {
		console.warn('Failed to remove push subscription; logging out anyway', e);
	}
	try {
		await logoutRequest();
	} catch (e) {
		console.warn('Logout request failed; clearing local session anyway', e);
	}
	await clearSession();
	await goto('/login');
}

/**
 * Guard a `?next=` value against open redirects: only same-origin, absolute
 * in-app paths are allowed. Returns the path, or null if it isn't safe to use.
 */
export function safeNext(next: string | null | undefined): string | null {
	if (!next) return null;
	// Must be a root-relative path, and not protocol-relative ("//evil.com")
	// or a back-slash trick ("/\\evil.com").
	if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
	return next;
}
