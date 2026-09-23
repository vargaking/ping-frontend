import { getServerChannels } from '$lib/requests/channels/getServerChannels';
import { getUserServers } from '$lib/requests/servers/getUserServers';
import { updateServer } from '$lib/requests/servers/updateServer';
import type { Channel } from '$lib/types/channel.types';
import type { Server } from '$lib/types/server.types';
import type { User } from '$lib/types/auth.types';
import { unreadState } from './unreadState.svelte';

export class ServersState {
	servers: Record<number, Server> = $state({});
	selectedServer: Server | null = $state(null);
	selectedServerChannels: Record<number, Channel> = $state({});
	selectedChannel: Channel | null = $state(null);

	serversList: Server[] = $derived(Object.values(this.servers));
	selectedServerChannelsList: Channel[] = $derived.by(() => {
		const channels = this.selectedServerChannels;
		const all = Object.values(channels);
		const order = this.selectedServer?.server_settings?.channel_order;
		if (!order || order.length === 0) return all;

		// Channels in the saved order first...
		const ordered = order.map((id) => channels[id]).filter((ch): ch is Channel => ch != null);
		// ...then any channel not yet in channel_order (e.g. just created) appended,
		// so new channels show immediately instead of only after a reload.
		const orderedIds = new Set(order);
		const rest = all.filter((ch) => !orderedIds.has(ch.id));
		return [...ordered, ...rest];
	});

	setSelectedServer(server: Server | null) {
		this.selectedServer = server;

		if (server && server.id != null) {
			this.servers[server.id] = server;
		}
	}

	setSelectedServerById(serverId: number) {
		const server = this.servers[serverId];
		if (server) {
			this.setSelectedServer(server);
		}
	}

	setSelectedChannel(channel: Channel | null) {
		this.selectedChannel = channel;

		if (channel) {
			this.selectedServerChannels[channel.id] = channel;
		}
	}

	setSelectedChannelById(channelId: number) {
		const channel = this.selectedServerChannels[channelId];
		if (channel) {
			this.setSelectedChannel(channel);
		}
	}

	async fetchUserServers(): Promise<Server[]> {
		const fetchedServers = await getUserServers();
		fetchedServers.forEach((server) => {
			if (server.id != null) this.servers[server.id] = server;
		});
		return fetchedServers;
	}

	async fetchServerChannels(serverId: number): Promise<Channel[]> {
		const fetchedChannels = await getServerChannels(serverId);
		fetchedChannels.forEach((channel) => {
			this.selectedServerChannels[channel.id] = channel;
		});
		unreadState.noteFetchedChannels(serverId, fetchedChannels);
		return fetchedChannels;
	}

	/** Patch in a channel we learned about over the socket (channel_created). */
	addChannel(serverId: number, channel: Channel) {
		unreadState.noteNewChannel(serverId, channel);

		// Only the selected server's channels live in this record; other servers
		// re-fetch their channels when opened, so there's nothing to patch there.
		if (this.selectedServer?.id !== serverId) return;
		if (this.selectedServerChannels[channel.id]) return;
		this.selectedServerChannels[channel.id] = channel;
	}

	/** Patch in a member who joined over the socket (member_joined). */
	addMember(serverId: number, member: User) {
		const server = this.servers[serverId];
		if (!server) return;
		if (server.members?.some((m) => m.id === member.id)) return;

		const updated = { ...server, members: [...(server.members ?? []), member] };
		this.servers[serverId] = updated;
		if (this.selectedServer?.id === serverId) this.selectedServer = updated;
	}

	private reorderTimeout: ReturnType<typeof setTimeout> | null = null;

	reorderChannels(serverId: number, channelIds: number[]) {
		if (!this.selectedServer || this.selectedServer.id !== serverId) return;

		// Update local state immediately — Svelte re-renders the list
		this.selectedServer = {
			...this.selectedServer,
			server_settings: {
				...this.selectedServer.server_settings,
				channel_order: channelIds
			}
		};
		this.servers[serverId] = this.selectedServer;

		// Debounce the server update so rapid reorders don't spam the API
		if (this.reorderTimeout) clearTimeout(this.reorderTimeout);
		this.reorderTimeout = setTimeout(async () => {
			try {
				await updateServer(serverId, {
					server_settings: this.servers[serverId].server_settings
				});
			} catch (e) {
				console.error('Failed to persist channel order:', e);
			}
		}, 500);
	}
}

export const serversState = new ServersState();
