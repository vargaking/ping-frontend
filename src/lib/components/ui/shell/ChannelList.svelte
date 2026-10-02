<script lang="ts">
	import { page } from '$app/state';
	import { serversState } from '$lib/states/serversState.svelte';
	import { Permission } from '$lib/permissions';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { voiceRoster } from '$lib/states/voiceRoster.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import type { Channel } from '$lib/types/channel.types';
	import SidebarRow from './SidebarRow.svelte';
	import PresenceParticipant from './PresenceParticipant.svelte';
	import CreateChannelDialog from '$lib/components/servers/CreateChannelDialog.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
	import * as Tooltip from '$lib/components/ui/tooltip/index';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { removeServerMember } from '$lib/requests/servers/removeServerMember';
	import { usersState } from '$lib/states/usersState.svelte';
	import { serverRemoved } from '$lib/utils/serverRemoved';
	import { toast } from 'svelte-sonner';
	import { mergeProps } from 'bits-ui';
	import { getErrorMessage } from '$lib/requests/errors';
	import { Hash, Volume2, ChevronDown, Plus, Settings, LogOut } from 'lucide-svelte';

	function confirmLeave() {
		const server = serversState.selectedServer;
		const me = usersState.loggedInUser;
		if (server?.id == null || !me) return;
		const serverId = server.id;
		overlayState.open(ConfirmDialog, {
			title: `Leave ${server.name}?`,
			description: "You won't be able to rejoin unless someone invites you again.",
			confirmLabel: 'Leave server',
			destructive: true,
			onConfirm: async () => {
				try {
					await removeServerMember(serverId, me.id);
				} catch (e) {
					toast.error(`Couldn't leave the server: ${getErrorMessage(e)}`);
					return;
				}
				await serverRemoved(serverId);
				toast.success(`Left ${server.name}`);
			}
		});
	}

	let createOpen = $state(false);

	const canManageChannels = $derived(serversState.can(Permission.MANAGE_CHANNELS));

	const activeChannelId = $derived(page.params.channelId ? parseInt(page.params.channelId) : null);

	const textChannels = $derived(
		serversState.selectedServerChannelsList.filter((c) => c.type === 'text')
	);
	const voiceChannels = $derived(
		serversState.selectedServerChannelsList.filter((c) => c.type === 'voice')
	);

	// --- drag reorder (per section, preserving the other section's positions) ---
	let dragType: 'text' | 'voice' | null = $state(null);
	let dragIndex: number | null = $state(null);
	let hoverIndex: number | null = $state(null);

	function handleDragStart(type: 'text' | 'voice', index: number) {
		dragType = type;
		dragIndex = index;
	}

	function handleDragOver(e: DragEvent, type: 'text' | 'voice', index: number) {
		if (dragType !== type) return;
		e.preventDefault();
		hoverIndex = index;
	}

	function handleDrop(type: 'text' | 'voice') {
		if (
			dragType !== type ||
			dragIndex === null ||
			hoverIndex === null ||
			dragIndex === hoverIndex ||
			!serversState.selectedServer?.id
		) {
			resetDrag();
			return;
		}

		const section = (type === 'text' ? textChannels : voiceChannels).map((c) => c.id);
		const [moved] = section.splice(dragIndex, 1);
		section.splice(hoverIndex, 0, moved);

		// Rebuild the full order, substituting this section's ids in their new order
		// while keeping the other type's channels where they are.
		let si = 0;
		const full = serversState.selectedServerChannelsList.map((c) =>
			c.type === type ? section[si++] : c.id
		);
		serversState.reorderChannels(serversState.selectedServer.id, full);
		resetDrag();
	}

	function dropEdge(type: 'text' | 'voice', index: number): 'before' | 'after' | null {
		if (dragType !== type || dragIndex === null || hoverIndex !== index || dragIndex === index) {
			return null;
		}
		return dragIndex > index ? 'before' : 'after';
	}

	function resetDrag() {
		dragType = null;
		dragIndex = null;
		hoverIndex = null;
	}

	function openChannelSettings(channel: Channel) {
		overlayState.open(SettingsModal, { category: 'channel', channelId: channel.id });
	}

	function channelHref(channel: Channel) {
		return `/app/server/${serversState.selectedServer?.id}/channel/${channel.id}/`;
	}

	function voiceHref(channel: Channel) {
		return `/app/server/${serversState.selectedServer?.id}/voice/${channel.id}/`;
	}
</script>

{#snippet settingsButton(channel: Channel)}
	{#if canManageChannels}
		<!-- A sibling of the row, not a child: the row is itself a link or button. -->
		<button
			type="button"
			aria-label="Settings for {channel.name}"
			onclick={() => openChannelSettings(channel)}
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

{#snippet voiceRow(channel: Channel, i: number, triggerProps: Record<string, unknown> = {})}
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
		href={voiceHref(channel)}
		active={channel.id === activeChannelId}
		dragging={dragType === 'voice' && dragIndex === i}
		draggable={canManageChannels}
		ondragstart={() => handleDragStart('voice', i)}
		ondragover={(e) => handleDragOver(e, 'voice', i)}
		ondrop={() => handleDrop('voice')}
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
			<DropdownMenu.Item onclick={() => overlayState.open(SettingsModal, { category: 'server' })}>
				<Settings size={16} strokeWidth={1.75} />
				Server settings
			</DropdownMenu.Item>
			{#if !serversState.isSelectedServerOwner}
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive" onclick={confirmLeave}>
					<LogOut size={16} strokeWidth={1.75} />
					Leave server
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<!-- body -->
	<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 py-3 scrollbar-stable">
		<!-- Channels -->
		<section>
			<div class="flex h-6 items-center justify-between px-2">
				<span class="text-xs font-medium tracking-[0.02em] text-text-subtle">Channels</span>
				{#if canManageChannels}
					<button
						type="button"
						aria-label="Create channel"
						onclick={() => (createOpen = true)}
						class="flex h-5 w-5 items-center justify-center rounded text-text-subtle transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<Plus size={16} strokeWidth={1.75} />
					</button>
				{/if}
			</div>

			<div class="mt-1 flex flex-col gap-0.5">
				{#each textChannels as channel, i (channel.id)}
					<div class="group/row relative">
						<SidebarRow
							label={channel.name}
							href={channelHref(channel)}
							active={channel.id === activeChannelId}
							unread={channel.id !== activeChannelId && unreadState.channelUnread(channel.id)}
							mentions={unreadState.channelMentions(channel.id)}
							dragging={dragType === 'text' && dragIndex === i}
							draggable={canManageChannels}
							ondragstart={() => handleDragStart('text', i)}
							ondragover={(e) => handleDragOver(e, 'text', i)}
							ondrop={() => handleDrop('text')}
							ondragend={resetDrag}
						>
							{#snippet icon()}
								<Hash size={16} strokeWidth={1.75} />
							{/snippet}
						</SidebarRow>
						{@render settingsButton(channel)}
						{@render dropIndicator(dropEdge('text', i))}
					</div>
				{/each}
				{#if textChannels.length === 0}
					<p class="px-2 py-1 text-xs text-text-subtle">No text channels yet.</p>
				{/if}
			</div>
		</section>

		<!-- Voice -->
		{#if voiceChannels.length > 0}
			<section>
				<div class="flex h-6 items-center px-2">
					<span class="text-xs font-medium tracking-[0.02em] text-text-subtle">Voice</span>
				</div>
				<div class="mt-1 flex flex-col gap-0.5">
					{#each voiceChannels as channel, i (channel.id)}
						{@const topic = channel.topic?.trim()}
						<div class="group/row relative">
							{#if topic}
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											{@render voiceRow(channel, i, props)}
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content side="right" sideOffset={8}>{topic}</Tooltip.Content>
								</Tooltip.Root>
							{:else}
								{@render voiceRow(channel, i)}
							{/if}
							{@render settingsButton(channel)}
							{@render dropIndicator(dropEdge('voice', i))}
						</div>
						{@const roster = voiceRoster(channel.id)}
						{#if roster.length > 0}
							<div class="mt-0.5 flex flex-col gap-0.5">
								{#each roster as member (member.userId)}
									<PresenceParticipant {member} />
								{/each}
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/if}
	</div>
</div>

<CreateChannelDialog bind:open={createOpen} />
