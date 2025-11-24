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
	import UserSVG from '$lib/components/icons/UserSVG.svelte';
    import { voiceStore } from '$lib/stores/voiceStore';
    import VoiceControls from '$lib/components/voice/VoiceControls.svelte';
    import { Hash, Volume2 } from 'lucide-svelte';

	let channelName: string = '';
    let channelType: 'text' | 'voice' = 'text';

</script>

<div class="flex flex-col">
	<div class="flex h-full flex-row">
		<div class="flex h-full w-16 flex-col items-center gap-4 border-r border-border py-4">
			<SidebarItem href="/app/direct" label="Direct Messages">
				<ChatSVG />
			</SidebarItem>

			<hr class="mx-2 w-2/3 rounded border border-border" />

			{#each $UserServersStore as server}
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
		<div class="flex h-full w-64 flex-col gap-0.5 border-r border-border bg-sidebar">
			<span class="block p-4 font-bold">{$CurrentServerStore?.name}</span>
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
                    
                    <div class="flex gap-4 mb-4">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="channelType" value="text" bind:group={channelType} class="accent-primary" />
                            <span>Text</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="channelType" value="voice" bind:group={channelType} class="accent-primary" />
                            <span>Voice</span>
                        </label>
                    </div>

					<Dialog.Footer>
						<Button
							onclick={() => {
								if (!$CurrentServerIdStore) return;
								createChannel($CurrentServerIdStore, channelName, channelType);
                                channelName = ''; // Reset
							}}>Create</Button
						>
					</Dialog.Footer>
					<Dialog.Footer />
				</Dialog.Content>
			</Dialog.Root>

			<span class="block p-2 font-bold">Channels</span>

			{#each $UserChannelsStore as channel}
				{@const active =
					$page.url.pathname === `/app/server/${$CurrentServerIdStore}/channel/${channel.id}/`}
				<div class="flex items-center justify-between hover:bg-sidebar-accent rounded mx-2 px-2 py-1 group">
                    {#if channel.type === 'voice'}
                        <button
                            class="flex-grow cursor-pointer text-left flex items-center gap-2 {active ? 'font-bold' : ''}"
                            onclick={() => voiceStore.joinVoice(channel.id)}
                        >
                            <Volume2 size={16} class="text-muted-foreground" />
                            {channel.name}
                        </button>
                    {:else}
                        <a
                            class="flex-grow cursor-pointer text-left flex items-center gap-2 {active ? 'font-bold' : ''}"
                            href="/app/server/{$CurrentServerIdStore}/channel/{channel.id}/"
                            onclick={() => {
                                CurrentChannelIdStore.set(channel.id);
                            }}
                        >
                            <Hash size={16} class="text-muted-foreground" />
                            {channel.name}
                        </a>
                    {/if}
                </div>
			{/each}
		</div>
	</div>
    
    <VoiceControls />

	<div class="flex h-fit items-center justify-start gap-2 p-2 border-t border-border">
		<div class="rounded-xl bg-accent p-2">
			<UserSVG color="white" />
		</div>
		<span>{$UserStore?.username}</span>
	</div>
</div>
