<script lang="ts">
	import ChatSVG from '$lib/components/icons/ChatSVG.svelte';
	import PlusSVG from '$lib/components/icons/PlusSVG.svelte';
	import { UserChannelsStore } from '$lib/stores/channelsStore';
	import {
		CurrentChannelIdStore,
		CurrentServerIdStore,
		CurrentServerStore,
		UserServersStore,
		UserStore
	} from '$lib/stores/userStore';
	import SidebarItem from './SidebarItem.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Input from '../input/input.svelte';
	import Button from '../button/button.svelte';
	import { createChannel } from '$lib/requests/channels/createChannel';
	import { page } from '$app/stores';
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import { voiceStore } from '$lib/stores/voiceStore';
	import VoiceControls from '$lib/components/voice/VoiceControls.svelte';
	import { Hash, Volume2 } from 'lucide-svelte';

	let channelName: string = '';
	let channelType: 'text' | 'voice' = 'text';

	import { overlayState } from '$lib/states/overlayState.svelte';
	import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
	import { Settings } from 'lucide-svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { onMount } from 'svelte';
	import { usersState } from '$lib/states/usersState.svelte';

	let dragIndex: number | null = $state(null);
	let hoverIndex: number | null = $state(null);

	function handleDragStart(index: number) {
		dragIndex = index;
	}

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		hoverIndex = index;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		if (dragIndex == null || hoverIndex == null || dragIndex === hoverIndex) {
			dragIndex = null;
			hoverIndex = null;
			return;
		}

		if (!serversState.selectedServer) return;

		const channelIds = serversState.selectedServerChannelsList.map((c) => c.id);
		const [moved] = channelIds.splice(dragIndex, 1);
		channelIds.splice(hoverIndex, 0, moved);

		serversState.reorderChannels(serversState.selectedServer.id, channelIds);

		dragIndex = null;
		hoverIndex = null;
	}

	function handleDragEnd() {
		dragIndex = null;
		hoverIndex = null;
	}
</script>

<div class="flex flex-col">
	<div class="flex h-full flex-row">
		<div class="flex h-full w-16 flex-col items-center gap-4 border-r border-border py-4">
			<SidebarItem href="/app/direct" label="Direct Messages">
				<ChatSVG />
			</SidebarItem>

			<hr class="mx-2 w-2/3 rounded border border-border" />

			{#each serversState.serversList as server}
				<SidebarItem href={`/app/server/${server.id}/`} label={server.name}>
					{#if server.server_profile.iconUrl}
						<img
							src={server.server_profile.iconUrl}
							alt={server.name}
							class="h-8 w-8 rounded-full"
						/>
					{:else}
						<span class="text-xl font-bold text-primary">
							{server.name[0]}
						</span>
					{/if}
				</SidebarItem>
			{/each}

			<SidebarItem href="/app/add-server" label="Add Server">
				<PlusSVG />
			</SidebarItem>
		</div>
		{#if serversState.selectedServer}
			<div class="flex h-full w-64 flex-col gap-0.5 border-r border-border bg-sidebar">
				<span class="block p-4 font-bold">{serversState.selectedServer?.name}</span>
				<Dialog.Root>
					<Dialog.Trigger class="w-full">
						<span
							class="mx-2 block cursor-pointer rounded px-2 py-1 text-left hover:bg-sidebar-accent"
						>
							Create Channel
						</span>
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Header><Dialog.Title>Create a New Channel</Dialog.Title></Dialog.Header>
						<Input placeholder="Channel Name" class="my-4 w-full" bind:value={channelName} />

						<div class="mb-4 flex gap-4">
							<label class="flex cursor-pointer items-center gap-2">
								<input
									type="radio"
									name="channelType"
									value="text"
									bind:group={channelType}
									class="accent-primary"
								/>
								<span>Text</span>
							</label>
							<label class="flex cursor-pointer items-center gap-2">
								<input
									type="radio"
									name="channelType"
									value="voice"
									bind:group={channelType}
									class="accent-primary"
								/>
								<span>Voice</span>
							</label>
						</div>

						<!-- TODO: rework this shit -->
						<Dialog.Footer>
							<Dialog.Close>
								<Button
									onclick={async () => {
										if (!serversState.selectedServer) return;
										await createChannel(serversState.selectedServer.id, channelName, channelType);
										await serversState.fetchServerChannels(serversState.selectedServer.id);
										channelName = ''; // Reset
									}}>Create</Button
								></Dialog.Close
							>
						</Dialog.Footer>
						<Dialog.Footer />
					</Dialog.Content>
				</Dialog.Root>

				<span class="block p-2 font-bold">Channels</span>

				<!-- Channels -->
				<section>
					{#each serversState.selectedServerChannelsList as channel, i}
						{@const url = `/app/server/${serversState.selectedServer?.id}/channel/${channel.id}/`}
						{@const active = $page.url.pathname === url}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							draggable="true"
							ondragstart={() => handleDragStart(i)}
							ondragover={(e) => handleDragOver(e, i)}
							ondrop={handleDrop}
							ondragend={handleDragEnd}
							class="group mx-2 flex items-center justify-between rounded px-2 py-1 hover:bg-sidebar-accent
								{dragIndex === i ? 'opacity-50' : ''}
								{hoverIndex === i && dragIndex !== i ? 'border-t-2 border-accent' : ''}"
						>
							{#if channel.type === 'voice'}
								<button
									class="flex grow cursor-pointer items-center gap-2 text-left {active
										? 'font-bold'
										: ''}"
									onclick={() => voiceStore.joinVoice(channel.id)}
								>
									<Volume2 size={16} class="text-muted-foreground" />
									{channel.name}
								</button>
							{:else}
								<a
									class="flex grow cursor-pointer items-center gap-2 text-left {active
										? 'font-bold'
										: ''}"
									href={url}
									onclick={() => {
										serversState.setSelectedChannel(channel);
									}}
								>
									<Hash size={16} class="text-muted-foreground" />
									{channel.name}
								</a>
							{/if}
						</div>
					{/each}
				</section>
			</div>
		{/if}
	</div>

	<VoiceControls />

	<div class="flex h-fit items-center justify-start gap-2 border-t border-border p-2">
		<div class="rounded-xl">
			<!-- {console.log('Sidebar UserStore:', $UserStore)} -->
			<Avatar user={usersState.loggedInUser} size="md" />
		</div>
		<span>{usersState.loggedInUser?.username}</span>
		<button
			class="ml-auto rounded-full p-2 transition-colors hover:bg-sidebar-accent"
			onclick={() => overlayState.open(SettingsModal)}
			title="User Settings"
		>
			<Settings size={18} />
		</button>
	</div>
</div>
