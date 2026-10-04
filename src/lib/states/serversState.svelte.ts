import { getServerChannelSnapshot } from '$lib/requests/channels/getServerChannelSnapshot';
import { setChannelLayout } from '$lib/requests/channels/setChannelLayout';
import { getErrorMessage } from '$lib/requests/errors';
import { toast } from 'svelte-sonner';
import { getServerMembers } from '$lib/requests/servers/getServerMembers';
import { getServerRoles } from '$lib/requests/servers/getServerRoles';
import { getUserServers } from '$lib/requests/servers/getUserServers';
import type { Channel, ChannelGroup, ChannelLayout } from '$lib/types/channel.types';
import type { Role, Server, ServerMember } from '$lib/types/server.types';
import type { User } from '$lib/types/auth.types';
import { has, parseMask, Permission } from '$lib/permissions';
import { unreadState } from './unreadState.svelte';
import { usersState } from './usersState.svelte';

export type ServerLayout = {
	ungrouped: Channel[];
	groups: { group: ChannelGroup; channels: Channel[] }[];
};

const byPosition = (a: { position: number; id: number }, b: { position: number; id: number }) =>
	a.position - b.position || a.id - b.id;

export class ServersState {
	servers: Record<number, Server> = $state({});
	/** Set once the first server fetch succeeds, so "no servers" isn't shown while loading. */
	loaded = $state(false);
	/** Channels per server; a missing key means the server's channels aren't loaded yet. */
	channels: Record<number, Record<number, Channel>> = $state({});
	/** Categories per server, loaded together with the channels. */
	channelGroups: Record<number, Record<number, ChannelGroup>> = $state({});
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
	selectedServerLayout: ServerLayout = $derived.by(() => {
		const groups = Object.values(
			this.selectedServerId != null ? (this.channelGroups[this.selectedServerId] ?? {}) : {}
		).sort(byPosition);
		const channels = Object.values(this.selectedServerChannels).sort(byPosition);
		const known = new Set(groups.map((g) => g.id));
		return {
			ungrouped: channels.filter((c) => c.group_id == null || !known.has(c.group_id)),
			groups: groups.map((group) => ({
				group,
				channels: channels.filter((c) => c.group_id === group.id)
			}))
		};
	});
	selectedServerChannelsList: Channel[] = $derived([
		...this.selectedServerLayout.ungrouped,
		...this.selectedServerLayout.groups.flatMap((g) => g.channels)
	]);

	/** Bumped whenever a layout is applied, so a failed save can tell if something newer landed. */
	private layoutVersion = 0;

	readonly selectedPermissions: bigint | undefined = $derived(
		this.selectedServer?.id != null ? this.permissions[this.selectedServer.id] : undefined
	);

	/** Whether the logged-in user owns the selected server; gates owner-only UI. */
	readonly isSelectedServerOwner: boolean = $derived(
		this.selectedServer?.owner_id != null &&
			this.selectedServer.owner_id === usersState.loggedInUser?.id
	);

	/** Whether they can create invites; managing others' invites is a separate permission. */
	readonly canInvite: boolean = $derived(has(this.selectedPermissions, Permission.CREATE_INVITE));

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
		this.channelGroups = {};
		this.selectedServerId = null;
		this.selectedChannelId = null;
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
		const { groups, channels } = await getServerChannelSnapshot(serverId);
		this.channelGroups[serverId] = Object.fromEntries(groups.map((g) => [g.id, g]));
		this.channels[serverId] = Object.fromEntries(channels.map((ch) => [ch.id, ch]));
		this.layoutVersion++;
		unreadState.noteFetchedChannels(serverId, channels);
		return channels;
	}

	addGroup(serverId: number, group: ChannelGroup) {
		const loaded = this.channelGroups[serverId];
		if (loaded) loaded[group.id] = group;
	}

	updateGroup(serverId: number, group: ChannelGroup) {
		const existing = this.channelGroups[serverId]?.[group.id];
		if (existing) this.channelGroups[serverId][group.id] = { ...existing, ...group };
	}

	/** Drop a deleted category; the layout says where its channels went. */
	removeGroup(serverId: number, groupId: number, layout: ChannelLayout) {
		const loaded = this.channelGroups[serverId];
		if (loaded) delete loaded[groupId];
		this.applyLayout(serverId, layout);
	}

	/** Set group and position of every channel and group the layout names. Unknown ids are
	 *  ignored, and channels it doesn't mention keep their values. */
	applyLayout(serverId: number, layout: ChannelLayout) {
		this.layoutVersion++;
		const channels = this.channels[serverId];
		const groups = this.channelGroups[serverId];
		if (!channels || !groups) return;

		const place = (ids: number[], groupId: number | null) =>
			ids.forEach((id, position) => {
				if (channels[id]) channels[id] = { ...channels[id], group_id: groupId, position };
			});
		place(layout.ungrouped, null);
		layout.groups.forEach(({ id, channel_ids }, position) => {
			if (!groups[id]) return;
			groups[id] = { ...groups[id], position };
			place(channel_ids, id);
		});
	}

	/** Apply a new layout at once and save it. A failed save goes back to the previous state,
	 *  unless a newer layout was applied meanwhile, and the server's state is refetched. */
	async setLayout(serverId: number, layout: ChannelLayout) {
		const before = {
			channels: { ...this.channels[serverId] },
			groups: { ...this.channelGroups[serverId] }
		};
		this.applyLayout(serverId, layout);
		const version = this.layoutVersion;
		try {
			await setChannelLayout(serverId, layout);
		} catch (e) {
			if (this.layoutVersion === version) {
				this.channels[serverId] = before.channels;
				this.channelGroups[serverId] = before.groups;
			}
			toast.error(`Couldn't save the channel order: ${getErrorMessage(e)}`);
			this.fetchServerChannels(serverId).catch((err) =>
				console.warn('Failed to refresh channels after a failed reorder', err)
			);
		}
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
		delete this.channelGroups[serverId];
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
			channel_settings: channel.channel_settings,
			group_id: channel.group_id ?? null,
			position: channel.position ?? existing.position
		};
	}

	/** Drop a deleted channel (own delete or channel_deleted). */
	removeChannel(serverId: number, channelId: number) {
		unreadState.forgetChannel(channelId);

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
}

export const serversState = new ServersState();
