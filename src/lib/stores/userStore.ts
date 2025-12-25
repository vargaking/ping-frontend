import { get, writable, derived } from 'svelte/store';
import type { User } from '$lib/types/auth.types';
import type { Server } from '$lib/types/server.types';
import type { Channel } from '$lib/types/channel.types';
import { getUser } from '$lib/requests/users/getUser';
import { db } from '$lib/utils/db';
import { UserChannelsStore } from '$lib/stores/channelsStore';

export const UserStore = writable<User | null>(null);

export const PeopleStore = writable<Record<number, User>>({});

export const getOrFetchUser = async (user_id: number): Promise<User | null> => {
	const user = await db.users.where('id').equals(user_id).first();

	// If user exists but has no avatar in profile, we might have stale data.
    // Force a re-fetch in that case.
	if (!user || !user.profile?.avatar) {
		const fetchedUser = await getUser(user_id);

		if (fetchedUser) {
			PeopleStore.update((people) => {
				people[user_id] = fetchedUser;
				return people;
			});

			await db.users.put(fetchedUser);
		}

		return fetchedUser;
	}

	return user;
};

export const UserServersStore = writable<Server[]>([]);

export const UserInitedStore = writable<boolean>(false);

export const CurrentServerIdStore = writable<number | null>(null);

export const CurrentChannelIdStore = writable<number | null>(null);

export const CurrentServerStore = derived(
	[UserServersStore, CurrentServerIdStore],
	([$UserServersStore, $CurrentServerIdStore]: [Server[], number | null]) => {
		if ($CurrentServerIdStore && $UserServersStore) {
			return $UserServersStore.find((s) => s.id === $CurrentServerIdStore) || null;
		}
		return null;
	}
);

export const CurrentChannelStore = derived(
	[UserChannelsStore, CurrentChannelIdStore],
	([$UserChannelsStore, $CurrentChannelIdStore]: [Channel[], number | null]) => {
		if ($CurrentChannelIdStore && $UserChannelsStore) {
			return $UserChannelsStore.find((c) => c.id === $CurrentChannelIdStore) || null;
		}
		return null;
	}
);
