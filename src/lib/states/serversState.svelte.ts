import { getServerChannels } from '$lib/requests/channels/getServerChannels';
import { getServerMembers } from '$lib/requests/servers/getServerMembers';
import { getServerRoles } from '$lib/requests/servers/getServerRoles';
import { getUserServers } from '$lib/requests/servers/getUserServers';
import { updateServer } from '$lib/requests/servers/updateServer';
import type { Channel } from '$lib/types/channel.types';
import type { Role, Server, ServerMember } from '$lib/types/server.types';
import type { User } from '$lib/types/auth.types';
import { has, parseMask, Permission } from '$lib/permissions';
import { unreadState } from './unreadState.svelte';
import { usersState } from './usersState.svelte';

export class ServersState {
	servers: Record<number, Server> = $state({});
	/** Set once the first server fetch succeeds, so "no servers" isn't shown while loading. */
	loaded = $state(false);
	/** Channels per server; a missing key means the server's channels aren't loaded yet. */
	channels: Record<number, Record<number, Channel>> = $state({});
	selectedServerId: number | null = $state(null);
	selectedChannelId: number | null = $state(null);
	permissions: Record<number, bigint> = $state({});
	roles: Record<number, Role[]> = $state({});
	/** Assigned role ids per server and user; the default role is never listed. */
	memberRoles: Record<number, Record<number, number[]>> = $state({});

	serversList: Server[] = $derived(Object.values(this.servers));
	selectedServer: Server | null = $derived(
		this.selectedServerId != null ? (this.servers[this.selectedServerId] ?? null) : null
	);
	selectedServerChannels: Record<number, Channel> = $derived(
		this.selectedServerId != null ? (this.channels[this.selectedServerId] ?? {}) : {}
	);
	selectedServerChannelsLoaded: boolean = $derived(
		this.selectedServerId != null && this.channels[this.selectedServerId] != null
	);
	selectedChannel: Channel | null = $derived(
		this.selectedChannelId != null
			? (this.selectedServerChannels[this.selectedChannelId] ?? null)
			: null
	);
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

	readonly selectedPermissions: bigint | undefined = $derived(
		this.selectedServer?.id != null ? this.permissions[this.selectedServer.id] : undefined
	);

	/** Whether the logged-in user owns the selected server; gates owner-only UI. */
	readonly isSelectedServerOwner: boolean = $derived(
		this.selectedServer?.owner_id != null &&
			this.selectedServer.owner_id === usersState.loggedInUser?.id
	);

	/** Whether they can create their own invites or manage everyone's. */
	readonly canInvite: boolean = $derived(
		has(this.selectedPermissions, Permission.CREATE_INVITE) ||
			has(this.selectedPermissions, Permission.MANAGE_INVITES)
	);

	can(perm: bigint, serverId: number | null | undefined = this.selectedServer?.id): boolean {
		return serverId != null && has(this.permissions[serverId], perm);
	}

	/** Replace every server's mask (permissions_init). */
	setPermissions(masks: Record<string, string>) {
		const next: Record<number, bigint> = {};
		for (const [serverId, mask] of Object.entries(masks)) next[Number(serverId)] = parseMask(mask);
		this.permissions = next;
	}

	setPermission(serverId: number, mask: string) {
		this.permissions[serverId] = parseMask(mask);
	}

	private notePermissions(server: Server) {
		if (server.id != null && server.permissions != null) {
			this.setPermission(server.id, server.permissions);
		}
	}

	setSelectedServerId(id: number | null) {
		this.selectedServerId = id;
	}

	setSelectedChannelId(id: number | null) {
		this.selectedChannelId = id;
	}

	reset() {
		this.servers = {};
		this.loaded = false;
		this.channels = {};
		this.selectedServerId = null;
		this.selectedChannelId = null;
		this.reorderTimeouts.forEach(clearTimeout);
		this.reorderTimeouts.clear();
	}

	async fetchUserServers(): Promise<Server[]> {
		const fetchedServers = await getUserServers();
		fetchedServers.forEach((server) => {
			if (server.id == null) return;
			this.servers[server.id] = server;
			this.notePermissions(server);
		});
		this.loaded = true;
		return fetchedServers;
	}

	/** Add a server the user just created. */
	addServer(server: Server) {
		if (server.id == null) return;
		this.servers[server.id] = server;
		this.notePermissions(server);
	}

	/** Load a server's members and roles, keeping role assignments for the sidebar. */
	async loadRoster(serverId: number): Promise<ServerMember[]> {
		const [members, roles] = await Promise.all([
			getServerMembers(serverId),
			getServerRoles(serverId)
		]);
		this.roles[serverId] = roles;
		this.memberRoles[serverId] = Object.fromEntries(members.map((m) => [m.user.id, m.role_ids]));
		return members;
	}

	setMemberRoles(serverId: number, userId: number, roleIds: number[]) {
		this.memberRoles[serverId] = { ...this.memberRoles[serverId], [userId]: roleIds };
	}

	/** Names of a member's assigned roles, the owner shown as "Owner". */
	roleNames(serverId: number, userId: number): string[] {
		if (this.servers[serverId]?.owner_id === userId) return ['Owner'];
		const roles = this.roles[serverId] ?? [];
		const ids = this.memberRoles[serverId]?.[userId] ?? [];
		return roles.filter((r) => ids.includes(r.id)).map((r) => r.name);
	}

	async fetchServerChannels(serverId: number): Promise<Channel[]> {
		const fetchedChannels = await getServerChannels(serverId);
		this.channels[serverId] = Object.fromEntries(fetchedChannels.map((ch) => [ch.id, ch]));
		unreadState.noteFetchedChannels(serverId, fetchedChannels);
		return fetchedChannels;
	}

	/** Patch in a channel we learned about over the socket (channel_created). */
	addChannel(serverId: number, channel: Channel) {
		unreadState.noteNewChannel(serverId, channel);

		const loaded = this.channels[serverId];
		if (!loaded || loaded[channel.id]) return;
		loaded[channel.id] = channel;
	}

	/** Merge fields of a changed server (own save or server_updated). */
	patchServer(serverId: number, changes: Partial<Server>) {
		const server = this.servers[serverId];
		if (!server) return;
		this.servers[serverId] = { ...server, ...changes };
	}

	/** Forget a deleted server (own delete or server_deleted). */
	removeServer(serverId: number) {
		delete this.servers[serverId];
		delete this.channels[serverId];
		delete this.permissions[serverId];
		delete this.roles[serverId];
		delete this.memberRoles[serverId];
		unreadState.forgetServer(serverId);
	}

	/** Merge a changed channel (own save or channel_updated) into local state.
	 *  Read-state fields are per user, so the local ones are kept. */
	updateChannel(serverId: number, channel: Channel) {
		unreadState.renameChannel(channel.id, channel.name);

		const loaded = this.channels[serverId];
		const existing = loaded?.[channel.id];
		if (!loaded || !existing) return;
		loaded[channel.id] = {
			...existing,
			name: channel.name,
			topic: channel.topic ?? null,
			channel_settings: channel.channel_settings
		};
	}

	/** Drop a deleted channel (own delete or channel_deleted). */
	removeChannel(serverId: number, channelId: number) {
		unreadState.forgetChannel(channelId);

		const server = this.servers[serverId];
		const order = server?.server_settings?.channel_order;
		if (server && order?.includes(channelId)) {
			this.servers[serverId] = {
				...server,
				server_settings: {
					...server.server_settings,
					channel_order: order.filter((id) => id !== channelId)
				}
			};
		}

		const loaded = this.channels[serverId];
		if (loaded) delete loaded[channelId];
	}

	/** Patch in a member who joined over the socket (member_joined). */
	addMember(serverId: number, member: User) {
		const server = this.servers[serverId];
		if (!server) return;
		if (server.members?.some((m) => m.id === member.id)) return;

		this.servers[serverId] = { ...server, members: [...(server.members ?? []), member] };
	}

	/** Drop a member who left or was kicked (member_left). */
	removeMember(serverId: number, userId: number) {
		const server = this.servers[serverId];
		if (!server?.members?.some((m) => m.id === userId)) return;

		this.servers[serverId] = { ...server, members: server.members.filter((m) => m.id !== userId) };
	}

	// Timer handles are never rendered, so they needn't be reactive.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private reorderTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

	reorderChannels(serverId: number, channelIds: number[]) {
		const server = this.servers[serverId];
		if (!server) return;

		// Update local state immediately — Svelte re-renders the list
		this.servers[serverId] = {
			...server,
			server_settings: { ...server.server_settings, channel_order: channelIds }
		};

		// Debounce the server update so rapid reorders don't spam the API
		clearTimeout(this.reorderTimeouts.get(serverId));
		this.reorderTimeouts.set(
			serverId,
			setTimeout(async () => {
				this.reorderTimeouts.delete(serverId);
				try {
					await updateServer(serverId, {
						server_settings: this.servers[serverId].server_settings
					});
				} catch (e) {
					console.error('Failed to persist channel order:', e);
				}
			}, 500)
		);
	}
}

export const serversState = new ServersState();
