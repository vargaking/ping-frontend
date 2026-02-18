import { getUser } from '$lib/requests/users/getUser';
import type { User } from '$lib/types/auth.types';
import { db } from '$lib/utils/db';
import { SvelteSet } from 'svelte/reactivity';

class UsersState {
	users: Record<number, User> = $state({});
	onlineUsers: SvelteSet<number> = $state(new SvelteSet());
	loggedInUser: User | null = $state(null);

	isOnline(userId: number): boolean {
		if (this.loggedInUser && userId === this.loggedInUser.id) return true;
		return this.onlineUsers.has(userId);
	}

	setLoggedInUser(user: User | null) {
		this.loggedInUser = user;
		if (user) {
			this.users[user.id] = user;
			this.onlineUsers = new SvelteSet([...this.onlineUsers, user.id]);
			//db.users.put(user);
		}
	}

	async fetchUser(userId: number): Promise<User | null> {
		const fetchedUser = await getUser(userId);

		if (fetchedUser) {
			this.users[userId] = fetchedUser;
			//await db.users.put(fetchedUser);
		}

		return fetchedUser;
	}

	async getOrFetchUser(userId: number): Promise<User | null> {
		// First, try to get user from memory state
		if (this.users[userId]) {
			return this.users[userId];
		}

		/*const user = await db.users.where('id').equals(userId).first();

		// If user exists in DB, return it
		if (user) {
			this.users[userId] = user;
			return user;
		}*/

		// Otherwise, fetch from API
		const fetchedUser = await this.fetchUser(userId);
		return fetchedUser;
	}

	setUserOnline(userId: number) {
		this.onlineUsers = new SvelteSet([...this.onlineUsers, userId]);
		if (!this.users[userId]) {
			this.fetchUser(userId);
		}
	}

	setUserOffline(userId: number) {
		const next = new SvelteSet(this.onlineUsers);
		next.delete(userId);
		this.onlineUsers = next;
	}

	setOnlineUsers(userIds: number[]) {
		const loggedInId = this.loggedInUser?.id;
		const ids = loggedInId ? [...new Set([...userIds, loggedInId])] : userIds;
		this.onlineUsers = new SvelteSet(ids);

		// Fetch any users we don't have yet
		for (const id of ids) {
			if (!this.users[id]) {
				this.fetchUser(id);
			}
		}
	}
}

export const usersState = new UsersState();
