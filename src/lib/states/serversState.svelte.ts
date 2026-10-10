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
import { reorderRoles } from '$lib/requests/servers/reorderRoles';
import { ALL_PERMISSIONS, has, parseMask, Permission } from '$lib/permissions';
import { getChannelViewers } from '$lib/requests/channels/permissionOverwrites';
import {
	applyPositions,
	assignedRoles,
	nameColor,
	positionsForOrder,
	rankOf,
	sortRoles,
	withoutRole
} from '$lib/utils/roles';
import { unreadState } from './unreadState.svelte';
import { usersState } from './usersState.svelte';

function sameChannel(a: Channel, b: Channel): boolean {
	return (
		a.name === b.name &&
		a.topic === b.topic &&
		a.group_id === b.group_id &&
		a.position === b.position &&
		a.private === b.private &&
		JSON.stringify(a.channel_settings) === JSON.stringify(b.channel_settings)
	);
}

export type ServerLayout = {
	ungrouped: Channel[];
	groups: { group: ChannelGroup; channels: Channel[] }[];
};

const byPosition = (a: { position: number; id: number }, b: { position: number; id: number }) =>
	a.position - b.position || a.id - b.id;

const CHANNELS_FRESH_MS = 30_000;

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
	/** Masks per server and channel where they differ from the server mask. */
	channelPermissions: Record<number, Record<number, bigint>> = $state({});
	/** Who can view a private channel, for its @mention list. */
	channelViewers: Record<number, number[]> = $state({});
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

	/** Whether the user holds every bit of `perm` in a channel: its own mask
	 *  when it differs, the server mask otherwise. */
	canIn(perm: bigint, channelId: number | null | undefined, serverId: number | null | undefined) {
		if (serverId == null) return false;
		const own = channelId != null ? this.channelPermissions[serverId]?.[channelId] : undefined;
		return has(own ?? this.permissions[serverId], perm);
	}

	/** Fetch who can view a channel. A failure leaves the list unfiltered. */
	async loadChannelViewers(channelId: number) {
		try {
			this.channelViewers[channelId] = await getChannelViewers(channelId);
		} catch (e) {
			console.warn('Failed to load channel viewers', e);
		}
	}

	/** Replace every server's mask and channel masks (permissions_init). */
	setPermissions(
		masks: Record<string, string>,
		channels: Record<string, Record<string, string>> = {}
	) {
		const next: Record<number, bigint> = {};
		for (const [serverId, mask] of Object.entries(masks)) next[Number(serverId)] = parseMask(mask);
		this.permissions = next;
		const nextChannels: Record<number, Record<number, bigint>> = {};
		for (const [serverId, byChannel] of Object.entries(channels)) {
			nextChannels[Number(serverId)] = parseChannelMasks(byChannel);
		}
		this.channelPermissions = nextChannels;
	}

	/** One server's masks (permissions_updated); `channels` replaces its whole channel map. */
	setPermission(serverId: number, mask: string, channels?: Record<string, string>) {
		this.permissions[serverId] = parseMask(mask);
		if (channels) this.channelPermissions[serverId] = parseChannelMasks(channels);
	}

	private notePermissions(server: Server) {
		if (server.id != null && server.permissions != null) {
			this.setPermission(server.id, server.permissions, server.channel_permissions);
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
		this.channelLoads = {};
		this.channelsLoadedAt = {};
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
		this.setRoles(serverId, roles);
		this.memberRoles[serverId] = Object.fromEntries(members.map((m) => [m.user.id, m.role_ids]));
		return members;
	}

	setMemberRoles(serverId: number, userId: number, roleIds: number[]) {
		this.memberRoles[serverId] = { ...this.memberRoles[serverId], [userId]: roleIds };
	}

	setRoles(serverId: number, roles: Role[]) {
		this.roles[serverId] = sortRoles(roles);
	}

	/** Add or replace a role (role_created, role_updated); ignored until roles are loaded. */
	upsertRole(serverId: number, role: Role) {
		const loaded = this.roles[serverId];
		if (!loaded) return;
		this.setRoles(serverId, [...loaded.filter((r) => r.id !== role.id), role]);
	}

	setRolePositions(serverId: number, positions: { id: number; position: number }[]) {
		const loaded = this.roles[serverId];
		if (loaded) this.roles[serverId] = applyPositions(loaded, positions);
	}

	/** Forget a deleted role everywhere it was used (role_deleted). */
	removeRole(serverId: number, roleId: number) {
		const loaded = this.roles[serverId];
		if (loaded) this.roles[serverId] = withoutRole(loaded, roleId);
		const members = this.memberRoles[serverId];
		if (!members) return;
		this.memberRoles[serverId] = Object.fromEntries(
			Object.entries(members).map(([userId, ids]) => [userId, ids.filter((id) => id !== roleId)])
		);
	}

	/** Apply a new role order at once and save it; a failed save goes back to the previous order.
	 *  `ids` lists every role except the default one, highest first. */
	async setRoleOrder(serverId: number, ids: number[]) {
		const before = this.roles[serverId];
		if (!before) return;
		this.setRolePositions(serverId, positionsForOrder(ids));
		try {
			this.setRoles(serverId, await reorderRoles(serverId, ids));
		} catch (e) {
			this.roles[serverId] = before;
			toast.error(`Couldn't save the role order: ${getErrorMessage(e)}`);
		}
	}

	isOwner(serverId: number): boolean {
		const ownerId = this.servers[serverId]?.owner_id;
		return ownerId != null && ownerId === usersState.loggedInUser?.id;
	}

	/** The logged-in user's mask; the owner holds every permission. */
	maskOf(serverId: number): bigint {
		return this.isOwner(serverId) ? ALL_PERMISSIONS : (this.permissions[serverId] ?? 0n);
	}

	/** Position of the logged-in user's highest role; the owner outranks every role. */
	rankIn(serverId: number): number {
		if (this.isOwner(serverId)) return Infinity;
		const me = usersState.loggedInUser?.id;
		const ids = me != null ? (this.memberRoles[serverId]?.[me] ?? []) : [];
		return rankOf(this.roles[serverId] ?? [], ids);
	}

	/** A member's assigned roles, highest first. */
	rolesOf(serverId: number, userId: number): Role[] {
		return assignedRoles(this.roles[serverId] ?? [], this.memberRoles[serverId]?.[userId] ?? []);
	}

	/** Colour of the member's highest coloured role. */
	nameColorOf(serverId: number | null | undefined, userId: number): string | null {
		if (serverId == null) return null;
		return nameColor(this.roles[serverId] ?? [], this.memberRoles[serverId]?.[userId] ?? []);
	}

	private channelLoads: Record<number, Promise<Channel[]>> = {};
	private channelsLoadedAt: Record<number, number> = {};

	/** A server's channels, sharing a load that is still running or one that finished
	 *  less than `maxAgeMs` ago, so startup and the server page don't fetch twice.
	 *  The socket keeps loaded channels current in between. */
	loadServerChannels(serverId: number, maxAgeMs = CHANNELS_FRESH_MS): Promise<Channel[]> {
		const running = this.channelLoads[serverId];
		if (running) return running;
		const loadedAt = this.channelsLoadedAt[serverId];
		const known = this.channels[serverId];
		if (known && loadedAt != null && Date.now() - loadedAt < maxAgeMs) {
			return Promise.resolve(Object.values(known));
		}
		const load = this.fetchServerChannels(serverId).finally(
			() => delete this.channelLoads[serverId]
		);
		this.channelLoads[serverId] = load;
		return load;
	}

	async fetchServerChannels(serverId: number): Promise<Channel[]> {
		const { groups, channels } = await getServerChannelSnapshot(serverId);
		this.channelsLoadedAt[serverId] = Date.now();
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
		if (!existing) return;
		const next = { ...existing, ...group };
		if ((Object.keys(next) as (keyof ChannelGroup)[]).every((key) => next[key] === existing[key])) {
			return;
		}
		this.channelGroups[serverId][group.id] = next;
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
		delete this.channelPermissions[serverId];
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
		const next = {
			...existing,
			name: channel.name,
			topic: channel.topic ?? null,
			channel_settings: channel.channel_settings,
			group_id: channel.group_id ?? null,
			position: channel.position ?? existing.position,
			private: channel.private ?? existing.private
		};
		if (!sameChannel(existing, next)) loaded[channel.id] = next;
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

function parseChannelMasks(masks: Record<string, string>): Record<number, bigint> {
	const out: Record<number, bigint> = {};
	for (const [channelId, mask] of Object.entries(masks)) out[Number(channelId)] = parseMask(mask);
	return out;
}

export const serversState = new ServersState();
