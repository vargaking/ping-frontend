import { isAxiosError } from 'axios';
import { getMe } from '$lib/requests/auth/me';
import { socketState } from '$lib/states/socketState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import { serversState } from '$lib/states/serversState.svelte';
import { conversationsState } from '$lib/states/conversationsState.svelte';

/** No answer at all or a server error, as opposed to a definite "not logged in". */
function isUnreachable(error: unknown): boolean {
	if (!isAxiosError(error)) return false;
	return !error.response || error.response.status >= 500;
}

/** Servers, every server's channels (which carry the unread markers) and the DMs, all at once. */
async function loadLists() {
	const servers = serversState
		.fetchUserServers()
		.then((list) =>
			Promise.all(
				list.map((server) =>
					server.id == null
						? null
						: serversState
								.loadServerChannels(server.id)
								.catch((e) => console.warn('Failed to load channels for server', server.id, e))
				)
			)
		)
		.catch((e) => console.error('Failed to load servers', e));
	await Promise.all([servers, conversationsState.fetch()]);
}

/** Resolves as soon as the session is known; the lists keep loading behind the app. */
export const initializeAppData = async (): Promise<'ok' | 'unreachable'> => {
	let user;
	try {
		user = await getMe();
	} catch (error) {
		console.error('Error initializing app data:', error);
		return isUnreachable(error) ? 'unreachable' : 'ok';
	}

	if (user) {
		usersState.setLoggedInUser(user);
		socketState.connect();
		void loadLists();
	}
	// Left behind by the startup message sync this replaced.
	try {
		localStorage.removeItem('last_updated');
	} catch {
		/* storage unavailable */
	}
	return 'ok';
};
