import { getMe } from '$lib/requests/auth/me';
import { getMessages } from '$lib/requests/auth/getMessages';
import { socketState } from '$lib/states/socketState.svelte';
import { db } from '$lib/utils/db';
import { usersState } from '$lib/states/usersState.svelte';
import { serversState } from '$lib/states/serversState.svelte';

export const initializeAppData = async () => {
	try {
		const user = await getMe();
		console.log('Fetched user:', user);

		if (user) {
			usersState.setLoggedInUser(user);

			// Connect socket
			socketState.connect();

			// Fetch servers
			await serversState.fetchUserServers();

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
};
