<script lang="ts">
	import { page } from '$app/state';
	import { serversState } from '$lib/states/serversState.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { createChannel } from '$lib/requests/channels/createChannel';
	import type { Channel } from '$lib/types/channel.types';
	import SidebarRow from './SidebarRow.svelte';
	import VoiceParticipant from './VoiceParticipant.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
	import Input from '$lib/components/ui/input/input.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
	import { Hash, Volume2, ChevronDown, Plus, Settings, LogOut } from 'lucide-svelte';

	let channelName = $state('');
	let channelType: 'text' | 'voice' = $state('text');
	let createOpen = $state(false);

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

	function resetDrag() {
		dragType = null;
		dragIndex = null;
		hoverIndex = null;
	}

	async function submitCreateChannel() {
		const serverId = serversState.selectedServer?.id;
		if (!serverId || !channelName.trim()) return;
		await createChannel(serverId, channelName.trim(), channelType);
		await serversState.fetchServerChannels(serverId);
		channelName = '';
		channelType = 'text';
		createOpen = false;
	}

	function channelHref(channel: Channel) {
		return `/app/server/${serversState.selectedServer?.id}/channel/${channel.id}/`;
	}
</script>

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
			<DropdownMenu.Separator />
			<DropdownMenu.Item variant="destructive">
				<LogOut size={16} strokeWidth={1.75} />
				Leave server
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<!-- body -->
	<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 py-3">
		<!-- Channels -->
		<section>
			<div class="flex h-6 items-center justify-between px-2">
				<span class="text-xs font-medium tracking-[0.02em] text-text-subtle">Channels</span>
				<Dialog.Root bind:open={createOpen}>
					<Dialog.Trigger
						aria-label="Create channel"
						class="flex h-5 w-5 items-center justify-center rounded text-text-subtle transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<Plus size={16} strokeWidth={1.75} />
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Header><Dialog.Title>Create a channel</Dialog.Title></Dialog.Header>
						<div class="flex flex-col gap-4 py-2">
							<Input placeholder="Channel name" bind:value={channelName} />
							<div class="flex gap-4">
								<label class="flex cursor-pointer items-center gap-2 text-sm">
									<input
										type="radio"
										name="channelType"
										value="text"
										bind:group={channelType}
										class="accent-primary"
									/>
									Text
								</label>
								<label class="flex cursor-pointer items-center gap-2 text-sm">
									<input
										type="radio"
										name="channelType"
										value="voice"
										bind:group={channelType}
										class="accent-primary"
									/>
									Voice
								</label>
							</div>
						</div>
						<Dialog.Footer>
							<Button onclick={submitCreateChannel} disabled={!channelName.trim()}>Create</Button>
						</Dialog.Footer>
					</Dialog.Content>
				</Dialog.Root>
			</div>

			<div class="mt-1 flex flex-col gap-0.5">
				{#each textChannels as channel, i (channel.id)}
					<SidebarRow
						label={channel.name}
						href={channelHref(channel)}
						active={channel.id === activeChannelId}
						dragging={dragType === 'text' && dragIndex === i}
						draggable="true"
						ondragstart={() => handleDragStart('text', i)}
						ondragover={(e) => handleDragOver(e, 'text', i)}
						ondrop={() => handleDrop('text')}
						ondragend={resetDrag}
						onclick={() => serversState.setSelectedChannel(channel)}
					>
						{#snippet icon()}
							<Hash size={16} strokeWidth={1.75} />
						{/snippet}
					</SidebarRow>
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
						<SidebarRow
							label={channel.name}
							active={voiceState.channelId === channel.id}
							dragging={dragType === 'voice' && dragIndex === i}
							draggable="true"
							ondragstart={() => handleDragStart('voice', i)}
							ondragover={(e) => handleDragOver(e, 'voice', i)}
							ondrop={() => handleDrop('voice')}
							ondragend={resetDrag}
							onclick={() => voiceState.joinVoice(channel.id)}
						>
							{#snippet icon()}
								<Volume2 size={16} strokeWidth={1.75} />
							{/snippet}
						</SidebarRow>
						{#if voiceState.channelId === channel.id}
							<div class="mt-0.5 flex flex-col gap-0.5">
								{#each Array.from(voiceState.peers.values()) as peer (peer.id)}
									<VoiceParticipant
										name={peer.username}
										avatar={peer.profile?.avatar}
										speaking={peer.isSpeaking}
									/>
								{/each}
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/if}
	</div>
</div>
