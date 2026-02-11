import { getServerChannels } from '$lib/requests/channels/getServerChannels';
import { getUserServers } from '$lib/requests/servers/getUserServers';
import type { Channel } from '$lib/types/channel.types';
import type { Server } from '$lib/types/server.types';

export class ServersState {
	servers: Record<number, Server> = $state({});
	selectedServer: Server | null = $state(null);
	selectedServerChannels: Record<number, Channel> = $state({});
	selectedChannel: Channel | null = $state(null);

	serversList: Server[] = $derived(Object.values(this.servers));
	selectedServerChannelsList: Channel[] = $derived(Object.values(this.selectedServerChannels));

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
}

export const serversState = new ServersState();
