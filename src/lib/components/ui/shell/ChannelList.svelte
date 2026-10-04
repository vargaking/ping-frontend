<script lang="ts">
	import { page } from '$app/state';
	import { serversState } from '$lib/states/serversState.svelte';
	import { Permission } from '$lib/permissions';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { voiceRoster } from '$lib/states/voiceRoster.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import type { Channel, ChannelGroup, ChannelLayout } from '$lib/types/channel.types';
	import { collapsedGroupsState } from '$lib/states/collapsedGroupsState.svelte';
	import {
		layoutIds,
		moveChannel,
		moveGroup,
		type ChannelDrop,
		type GroupDrop
	} from '$lib/utils/channelGroups';
	import SidebarRow from './SidebarRow.svelte';
	import PresenceParticipant from './PresenceParticipant.svelte';
	import CreateChannelDialog from '$lib/components/servers/CreateChannelDialog.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
	import * as Tooltip from '$lib/components/ui/tooltip/index';
	import InviteDialog from '$lib/components/servers/InviteDialog.svelte';
	import ActionContextMenu from '$lib/components/ui/context-menu/ActionContextMenu.svelte';
	import ActionDropdownItems from '$lib/components/ui/dropdown-menu/ActionDropdownItems.svelte';
	import {
		channelActions,
		channelGroupActions,
		openChannelSettings,
		serverActions
	} from '$lib/utils/menuActions';
	import { mergeProps } from 'bits-ui';
	import { channelPath } from '$lib/utils/channelRoutes';
	import {
		Hash,
		MessagesSquare,
		Volume2,
		ChevronDown,
		ChevronRight,
		Plus,
		Settings
	} from 'lucide-svelte';

	let createOpen = $state(false);
	let createGroupId: number | undefined = $state(undefined);
	let inviteOpen = $state(false);

	const canManageChannels = $derived(serversState.can(Permission.MANAGE_CHANNELS));
	const headerActions = $derived(
		serversState.selectedServer
			? serverActions(serversState.selectedServer, { onInvite: () => (inviteOpen = true) })
			: []
	);

	const activeChannelId = $derived(page.params.channelId ? parseInt(page.params.channelId) : null);

	const layout = $derived(serversState.selectedServerLayout);
	const hasChannels = $derived(
		layout.ungrouped.length > 0 || layout.groups.some((g) => g.channels.length > 0)
	);

	function visibleChannels(group: ChannelGroup, channels: Channel[]) {
		if (!collapsedGroupsState.isCollapsed(group.id)) return channels;
		return channels.filter(
			(c) =>
				c.id === activeChannelId ||
				(c.type !== 'voice' &&
					(unreadState.channelUnread(c.id) || unreadState.channelMentions(c.id) > 0)) ||
				(c.type === 'voice' && voiceRoster(c.id).length > 0)
		);
	}

	// --- drag and drop ---
	let dragChannelId: number | null = $state(null);
	let dragGroupId: number | null = $state(null);
	let channelDrop: ChannelDrop | null = $state(null);
	let groupDrop: GroupDrop | null = $state(null);

	function edgeOf(e: DragEvent): 'before' | 'after' {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
	}

	function startDrag(e: DragEvent, channelId: number | null, groupId: number | null) {
		e.stopPropagation();
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', '');
		}
		dragChannelId = channelId;
		dragGroupId = groupId;
	}

	function overChannel(e: DragEvent, channel: Channel) {
		if (dragChannelId === null) return;
		e.preventDefault();
		channelDrop = { kind: 'channel', id: channel.id, edge: edgeOf(e) };
	}

	function overGroup(e: DragEvent, group: ChannelGroup) {
		if (dragChannelId !== null) {
			e.preventDefault();
			channelDrop = { kind: 'group', id: group.id };
		} else if (dragGroupId !== null && dragGroupId !== group.id) {
			e.preventDefault();
			groupDrop = { id: group.id, edge: edgeOf(e) };
		}
	}

	function overUngrouped(e: DragEvent) {
		if (dragChannelId === null) return;
		e.preventDefault();
		channelDrop = { kind: 'ungrouped' };
	}

	function drop(e: DragEvent, target: 'channel' | 'group' | 'ungrouped') {
		const serverId = serversState.selectedServerId;
		const current = layoutIds(layout);
		let next: ChannelLayout | null = null;
		if (serverId != null && dragChannelId !== null && channelDrop) {
			e.preventDefault();
			next = moveChannel(current, dragChannelId, channelDrop);
		} else if (serverId != null && dragGroupId !== null && groupDrop && target === 'group') {
			e.preventDefault();
			next = moveGroup(current, dragGroupId, groupDrop);
		}
		resetDrag();
		if (serverId != null && next) serversState.setLayout(serverId, next);
	}

	function resetDrag() {
		dragChannelId = null;
		dragGroupId = null;
		channelDrop = null;
		groupDrop = null;
	}

	function channelEdge(channel: Channel): 'before' | 'after' | null {
		return channelDrop?.kind === 'channel' &&
			channelDrop.id === channel.id &&
			dragChannelId !== channel.id
			? channelDrop.edge
			: null;
	}

	function channelActionsFor(channel: Channel) {
		const serverId = serversState.selectedServerId;
		return serverId != null ? channelActions(serverId, channel) : [];
	}

	function channelHref(channel: Channel) {
		return channelPath(serversState.selectedServer?.id ?? 0, channel);
	}
</script>

{#snippet settingsButton(channel: Channel)}
	{#if canManageChannels}
		<!-- A sibling of the row, not a child: the row is itself a link or button. -->
		<button
			type="button"
			aria-label="Settings for {channel.name}"
			onclick={() => openChannelSettings(channel.id)}
			class="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-card text-text-subtle opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<Settings size={14} strokeWidth={1.75} />
		</button>
	{/if}
{/snippet}

{#snippet dropIndicator(edge: 'before' | 'after' | null)}
	{#if edge}
		<span
			aria-hidden="true"
			class="pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-primary {edge ===
			'before'
				? '-top-px'
				: '-bottom-px'}"
		></span>
	{/if}
{/snippet}

{#snippet voiceRow(channel: Channel, triggerProps: Record<string, unknown> = {})}
	<SidebarRow
		{...mergeProps(triggerProps, {
			// Screen readers get the topic even though the tooltip is visual.
			'aria-description': channel.topic?.trim() || undefined,
			onclick: (e: MouseEvent) => {
				// Opening the link in a new tab shouldn't join from this one.
				if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
				const serverId = serversState.selectedServerId;
				if (serverId != null && voiceState.channelId !== channel.id) {
					voiceState.joinVoice(serverId, channel.id);
				}
			}
		})}
		label={channel.name}
		href={channelHref(channel)}
		active={channel.id === activeChannelId}
		dragging={dragChannelId === channel.id}
		draggable={canManageChannels}
		ondragstart={(e) => startDrag(e, channel.id, null)}
		ondragend={resetDrag}
	>
		{#snippet icon()}
			<Volume2
				size={16}
				strokeWidth={1.75}
				class={voiceState.channelId === channel.id ? 'text-online' : undefined}
			/>
		{/snippet}
	</SidebarRow>
{/snippet}

{#snippet channelItem(channel: Channel)}
	{@const actions = channelActionsFor(channel)}
	{@const topic = channel.topic?.trim()}
	<div
		role="presentation"
		class="group/row relative"
		ondragover={(e) => overChannel(e, channel)}
		ondrop={(e) => drop(e, 'channel')}
	>
		<ActionContextMenu {actions}>
			{#snippet children(menuProps)}
				{#if channel.type === 'voice'}
					{#if topic}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									{@render voiceRow(channel, mergeProps(props, menuProps))}
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="right" sideOffset={8}>{topic}</Tooltip.Content>
						</Tooltip.Root>
					{:else}
						{@render voiceRow(channel, menuProps)}
					{/if}
				{:else}
					<SidebarRow
						{...menuProps}
						label={channel.name}
						href={channelHref(channel)}
						active={channel.id === activeChannelId}
						unread={channel.id !== activeChannelId && unreadState.channelUnread(channel.id)}
						mentions={unreadState.channelMentions(channel.id)}
						dragging={dragChannelId === channel.id}
						draggable={canManageChannels}
						ondragstart={(e) => startDrag(e, channel.id, null)}
						ondragend={resetDrag}
					>
						{#snippet icon()}
							{#if channel.type === 'forum'}
								<MessagesSquare size={16} strokeWidth={1.75} />
							{:else}
								<Hash size={16} strokeWidth={1.75} />
							{/if}
						{/snippet}
					</SidebarRow>
				{/if}
			{/snippet}
		</ActionContextMenu>
		{@render settingsButton(channel)}
		{@render dropIndicator(channelEdge(channel))}
	</div>
	{#if channel.type === 'voice'}
		{@const roster = voiceRoster(channel.id)}
		{#if roster.length > 0}
			<div class="mt-0.5 flex flex-col gap-0.5">
				{#each roster as member (member.userId)}
					<PresenceParticipant {member} />
				{/each}
			</div>
		{/if}
	{/if}
{/snippet}

{#snippet groupHeader(group: ChannelGroup, collapsed: boolean)}
	<div
		role="presentation"
		class="relative flex h-6 items-center justify-between rounded px-1 {channelDrop?.kind ===
			'group' && channelDrop.id === group.id
			? 'bg-accent'
			: ''} {dragGroupId === group.id ? 'opacity-50' : ''}"
		draggable={canManageChannels}
		ondragstart={(e) => startDrag(e, null, group.id)}
		ondragover={(e) => overGroup(e, group)}
		ondrop={(e) => drop(e, 'group')}
		ondragend={resetDrag}
	>
		<ActionContextMenu
			actions={channelGroupActions(group, {
				onCreateChannel: () => {
					createGroupId = group.id;
					createOpen = true;
				}
			})}
		>
			{#snippet children(menuProps)}
				<button
					{...menuProps}
					type="button"
					aria-expanded={!collapsed}
					onclick={() => collapsedGroupsState.toggle(group.id)}
					class="flex min-w-0 flex-1 items-center gap-1 rounded px-1 text-left text-xs font-medium tracking-[0.02em] text-text-subtle transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<ChevronRight
						size={12}
						strokeWidth={2}
						class="shrink-0 transition-transform {collapsed ? '' : 'rotate-90'}"
					/>
					<span class="truncate">{group.name}</span>
				</button>
			{/snippet}
		</ActionContextMenu>
		{#if canManageChannels}
			<button
				type="button"
				aria-label="Create channel in {group.name}"
				onclick={() => {
					createGroupId = group.id;
					createOpen = true;
				}}
				class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-subtle transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<Plus size={16} strokeWidth={1.75} />
			</button>
		{/if}
		{@render dropIndicator(groupDrop?.id === group.id ? groupDrop.edge : null)}
	</div>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col">
	<!-- server header -->
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="flex h-[52px] shrink-0 items-center justify-between border-b border-border py-0 pr-3 pl-4 text-left transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<span class="truncate text-[15px] font-semibold">{serversState.selectedServer?.name}</span>
			<ChevronDown size={16} strokeWidth={1.75} class="shrink-0 text-text-subtle" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="w-56">
			<ActionDropdownItems actions={headerActions} />
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<!-- body -->
	<div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-3 scrollbar-stable">
		{#if canManageChannels}
			<!-- Same height as the create row it replaces, so the list doesn't shift under the cursor. -->
			{#if dragChannelId !== null}
				<div
					role="presentation"
					ondragover={overUngrouped}
					ondrop={(e) => drop(e, 'ungrouped')}
					class="flex h-6 shrink-0 items-center justify-center rounded border border-dashed text-xs {channelDrop?.kind ===
					'ungrouped'
						? 'border-primary text-foreground'
						: 'border-border text-text-subtle'}"
				>
					Drop here for no category
				</div>
			{:else}
				<div class="flex h-6 shrink-0 items-center justify-end px-2">
					<button
						type="button"
						aria-label="Create channel"
						onclick={() => {
							createGroupId = undefined;
							createOpen = true;
						}}
						class="flex h-5 w-5 items-center justify-center rounded text-text-subtle transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<Plus size={16} strokeWidth={1.75} />
					</button>
				</div>
			{/if}
		{/if}

		<div class="flex flex-col gap-0.5">
			{#each layout.ungrouped as channel (channel.id)}
				{@render channelItem(channel)}
			{/each}
		</div>

		{#each layout.groups as { group, channels } (group.id)}
			{@const collapsed = collapsedGroupsState.isCollapsed(group.id)}
			{@const shown = visibleChannels(group, channels)}
			{#if canManageChannels || channels.length > 0}
				<section aria-label={group.name} class="mt-3">
					{@render groupHeader(group, collapsed)}
					<div class="mt-1 flex flex-col gap-0.5">
						{#each shown as channel (channel.id)}
							{@render channelItem(channel)}
						{/each}
					</div>
				</section>
			{/if}
		{/each}

		{#if !hasChannels}
			<p class="px-2 py-1 text-xs text-text-subtle">No channels yet.</p>
		{/if}
	</div>
</div>

<CreateChannelDialog bind:open={createOpen} groupId={createGroupId} />
<InviteDialog bind:open={inviteOpen} />
