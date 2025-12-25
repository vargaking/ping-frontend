import { getMe } from '$lib/requests/auth/me';
import { getMessages } from '$lib/requests/auth/getMessages';
import { getUserServers } from '$lib/requests/servers/getUserServers';
import { SocketStore } from '$lib/stores/socketStore';
import { UserInitedStore, UserServersStore, UserStore } from '$lib/stores/userStore';
import { db } from '$lib/utils/db';
import { get } from 'svelte/store';

export const initializeAppData = async () => {
	try {
		const user = await getMe();
		console.log('Fetched user:', user);

		if (user) {
			UserStore.set(user);
			UserInitedStore.set(true);
            
            // Update IndexedDB with fresh user data
            await db.users.put(user);

			// Connect socket
			get(SocketStore).connect();

			// Fetch servers
			getUserServers().then((servers) => {
				UserServersStore.set(servers);
			});

			// Fetch messages
			getMessages(localStorage.getItem('last_updated') || '1970-01-01T00:00:00Z').then(
				async (messages) => {
					console.log('Fetched messages:', messages);

					// Save the messages to db (bulkPut will update existing or insert new)
					await db.messages.bulkPut(messages);

					console.log('Messages saved to IndexedDB');
					localStorage.setItem('last_updated', new Date().toISOString());
				}
			);

			return user;
		} else {
			UserStore.set(null);
			return null;
		}
	} catch (error) {
		console.error('Error initializing app data:', error);
		UserStore.set(null);
		return null;
	}
};
