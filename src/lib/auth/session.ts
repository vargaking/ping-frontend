import { goto } from '$app/navigation';
import { usersState } from '$lib/states/usersState.svelte';
import { serversState } from '$lib/states/serversState.svelte';
import { messagesState } from '$lib/states/messagesState.svelte';
import { forumState } from '$lib/states/forumState.svelte';
import { serverImportState } from '$lib/states/serverImportState.svelte';
import { conversationsState } from '$lib/states/conversationsState.svelte';
import { unreadState } from '$lib/states/unreadState.svelte';
import { serverRequestState } from '$lib/states/serverRequestState.svelte';
import { notificationsState } from '$lib/states/notificationsState.svelte';
import { socketState } from '$lib/states/socketState.svelte';
import { historySyncState } from '$lib/states/historySyncState.svelte';
import { searchState } from '$lib/states/searchState.svelte';
import { overwritesState } from '$lib/states/overwritesState.svelte';
import { voiceState } from '$lib/states/voiceState.svelte';
import { voicePresenceState } from '$lib/states/voicePresenceState.svelte';
import { shareDialogState } from '$lib/states/shareDialogState.svelte';
import { replyState } from '$lib/states/replyState.svelte';
import { messageEditState } from '$lib/states/messageEditState.svelte';
import { overlayState } from '$lib/states/overlayState.svelte';
import { clearLocalCache } from '$lib/utils/db';
import { disablePush } from '$lib/utils/push';
import { logout as logoutRequest } from '$lib/requests/auth/logout';

/** Longest a slow LiveKit disconnect may hold up the logout. */
const VOICE_LEAVE_TIMEOUT_MS = 3000;

/**
 * Leave the call, never throwing and never waiting past the timeout. The mic and
 * screen tracks are already stopped by then, so a disconnect that is still
 * running only delays the server learning about it.
 */
async function leaveVoiceForLogout(): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(() => {
			console.warn('Leaving voice is taking too long; continuing the logout');
			resolve();
		}, VOICE_LEAVE_TIMEOUT_MS);
	});
	try {
		await Promise.race([voiceState.leaveVoice(), timeout]);
	} catch (e) {
		console.warn('Failed to leave voice during session teardown', e);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Tear down all client-side session state: close the socket, empty the in-memory
 * stores, and clear the local cache. Shared by an explicit logout and by the 401
 * interceptor so a dropped session and a deliberate logout both leave the app in
 * exactly the same clean state before we route back to /login.
 */
export async function clearSession(): Promise<void> {
	socketState.disconnect();
	await leaveVoiceForLogout();
	shareDialogState.close();
	voicePresenceState.reset();

	usersState.reset();

	serversState.reset();
	serverRequestState.reset();
	overwritesState.reset();

	messagesState.clearAll();
	forumState.reset();
	serverImportState.reset();
	conversationsState.reset();
	unreadState.reset();
	notificationsState.resetPush();
	searchState.reset();
	replyState.reset();
	messageEditState.stop();
	overlayState.close();

	// Settled first, so no write lands after the cache is cleared.
	await historySyncState.stop();

	try {
		await clearLocalCache();
	} catch (e) {
		console.warn('Failed to clear local cache during session teardown', e);
	}
}

/**
 * Full logout: close the socket, leave voice, remove the push subscription, tell the server to drop the session, wipe local state, and land
 * on /login. The cookie is cleared server-side even if the request fails, so we
 * always tear down and redirect regardless.
 */
export async function logout(): Promise<void> {
	// First, so the user goes offline and the mic stops right away instead of
	// after the slower push and logout requests below.
	socketState.disconnect();
	await leaveVoiceForLogout();
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
