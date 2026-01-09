import { getUser } from '$lib/requests/users/getUser';
import type { User } from '$lib/types/auth.types';
import { db } from '$lib/utils/db';

export class UsersState {
	users: Record<number, User> = $state({});
	loggedInUser: User | null = $state(null);

	async fetchAndStoreUser(userId: number): Promise<User | null> {
		const fetchedUser = await getUser(userId);

		if (fetchedUser) {
			this.users[userId] = fetchedUser;
			await db.users.put(fetchedUser);
		}

		return fetchedUser;
	}

	async getOrFetchUser(userId: number): Promise<User | null> {
		// First, try to get user from memory state
		if (this.users[userId]) {
			return this.users[userId];
		}

		const user = await db.users.where('id').equals(userId).first();

		// If user exists in DB, return it
		if (user) {
			this.users[userId] = user;
			return user;
		}

		// Otherwise, fetch from API
		const fetchedUser = await this.fetchAndStoreUser(userId);
		return fetchedUser;
	}
}
