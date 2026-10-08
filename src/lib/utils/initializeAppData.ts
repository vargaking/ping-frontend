import { isAxiosError } from 'axios';
import { getMe } from '$lib/requests/auth/me';
import { getMessages } from '$lib/requests/auth/getMessages';
import { socketState } from '$lib/states/socketState.svelte';
import { db } from '$lib/utils/db';
import { usersState } from '$lib/states/usersState.svelte';
import { serversState } from '$lib/states/serversState.svelte';
import { conversationsState } from '$lib/states/conversationsState.svelte';
import { unreadState } from '$lib/states/unreadState.svelte';

/** No answer at all or a server error, as opposed to a definite "not logged in". */
function isUnreachable(error: unknown): boolean {
	if (!isAxiosError(error)) return false;
	return !error.response || error.response.status >= 500;
}

export const initializeAppData = async (): Promise<'ok' | 'unreachable'> => {
	let user;
	try {
		user = await getMe();
		console.log('Fetched user:', user);
	} catch (error) {
		console.error('Error initializing app data:', error);
		return isUnreachable(error) ? 'unreachable' : 'ok';
	}

	try {
		if (user) {
			usersState.setLoggedInUser(user);

			// Connect socket
			socketState.connect();

			// Fetch servers
			const servers = await serversState.fetchUserServers();

			// Seed unread state for every server in parallel (not just the selected
			// one) so the rail can show unread while looking at a different server,
			// and fetch DM conversations here too so DM badges show outside /app/direct.
			const serverIds = servers.map((s) => s.id).filter((id): id is number => id != null);
			await Promise.all([unreadState.seedAllServers(serverIds), conversationsState.fetch()]);

			// Fetch messages
			const messages = await getMessages(
				localStorage.getItem('last_updated') || '1970-01-01T00:00:00Z'
			);
			console.log('Fetched messages:', messages);

			// Save the messages to db (bulkPut will update existing or insert new)
			await db.messages.bulkPut(messages);

			console.log('Messages saved to IndexedDB');
			localStorage.setItem('last_updated', new Date().toISOString());
		} else {
			console.log('No user logged in');
		}
	} catch (error) {
		console.error('Error initializing app data:', error);
	}
	return 'ok';
};
