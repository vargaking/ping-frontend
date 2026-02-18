import { getServerChannels } from '$lib/requests/channels/getServerChannels';
import { getUserServers } from '$lib/requests/servers/getUserServers';
import { updateServer } from '$lib/requests/servers/updateServer';
import type { Channel } from '$lib/types/channel.types';
import type { Server } from '$lib/types/server.types';

export class ServersState {
	servers: Record<number, Server> = $state({});
	selectedServer: Server | null = $state(null);
	selectedServerChannels: Record<number, Channel> = $state({});
	selectedChannel: Channel | null = $state(null);

	serversList: Server[] = $derived(Object.values(this.servers));
	selectedServerChannelsList: Channel[] = $derived.by(() => {
		const channels = this.selectedServerChannels;
		const order = this.selectedServer?.server_settings?.channel_order;
		if (!order || order.length === 0) return Object.values(channels);

		// Map over the order array to get channels in the correct order
		return order.map((id) => channels[id]);
	});

	setSelectedServer(server: Server | null) {
		this.selectedServer = server;

		if (server) {
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
			this.servers[server.id] = server;
		});
		return fetchedServers;
	}

	async fetchServerChannels(serverId: number): Promise<Channel[]> {
		const fetchedChannels = await getServerChannels(serverId);
		fetchedChannels.forEach((channel) => {
			this.selectedServerChannels[channel.id] = channel;
		});
		return fetchedChannels;
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
