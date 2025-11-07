import { get, writable } from 'svelte/store';
import type { User } from '$lib/types/auth.types';
import type { Server } from '$lib/types/server.types';
import type { Channel } from '$lib/types/channel.types';
import { getUser } from '$lib/requests/users/getUser';
import { db } from '$lib/utils/db';
import { getUserChannels } from '$lib/requests/channels/getUserChannels';

export const UserStore = writable<User | null>(null);

export const PeopleStore = writable<Record<number, User>>({});

export const getOrFetchUser = async (user_id: number): Promise<User | null> => {
	const user = await db.users.where('id').equals(user_id).first();

	if (!user) {
		const fetchedUser = await getUser(user_id);

		if (fetchedUser) {
			PeopleStore.update((people) => {
				people[user_id] = fetchedUser;
				return people;
			});

			await db.users.add(fetchedUser);
		}

		return fetchedUser;
	}

	return user;
};

export const UserServersStore = writable<Server[]>([]);

export const UserInitedStore = writable<boolean>(false);

export const CurrentServerIdStore = writable<number | null>(null);

export const CurrentChannelIdStore = writable<number | null>(null);

export const CurrentServerStore = writable<Server | null>(null);

export const CurrentChannelStore = writable<Channel | null>(null);

CurrentServerIdStore.subscribe(async (serverId) => {
	const user = get(UserStore);

	if (user && serverId !== null) {
		const servers = get(UserServersStore);
		const server = servers.find((s) => s.id === serverId) || null;
		CurrentServerStore.set(server);
	} else {
		CurrentServerStore.set(null);
	}
});

CurrentChannelIdStore.subscribe(async (channelId) => {
	const server = get(CurrentServerStore);

	if (server && channelId !== null) {
		const channels = await getUserChannels(server.id);
		const channel = channels.find((c) => c.id === channelId) || null;
		CurrentChannelStore.set(channel);
	} else {
		CurrentChannelStore.set(null);
	}
});
