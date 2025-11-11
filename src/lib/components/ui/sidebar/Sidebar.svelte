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

	let channelName: string = '';
</script>

<div class="flex flex-col">
	<div class="flex h-full flex-row">
		<div class="flex h-full w-16 flex-col items-center gap-4 border-r border-border py-4">
			<SidebarItem href="/direct" label="Direct Messages">
				<ChatSVG />
			</SidebarItem>

			<hr class="mx-2 w-2/3 rounded border border-border" />

			{#each $UserServersStore as server}
				<SidebarItem href={`/server/${server.id}/`} label={server.name}>
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

			<SidebarItem href="/add-server" label="Add Server">
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
					<Dialog.Footer>
						<Button
							onclick={() => {
								if (!$CurrentServerIdStore) return;
								createChannel($CurrentServerIdStore, channelName);
							}}>Create</Button
						>
					</Dialog.Footer>
					<Dialog.Footer />
				</Dialog.Content>
			</Dialog.Root>

			<span class="block p-2 font-bold">Channels</span>

			{#each $UserChannelsStore as channel}
				{@const active =
					$page.url.pathname === `/server/${$CurrentServerIdStore}/channel/${channel.id}/`}
				<a
					class="mx-2 block cursor-pointer rounded px-2 py-1 text-left hover:bg-sidebar-accent {active
						? 'bg-sidebar-accent'
						: ''}"
					href="/server/{$CurrentServerIdStore}/channel/{channel.id}/"
					on:click={() => {
						CurrentChannelIdStore.set(channel.id);
					}}
				>
					{channel.name}
				</a>
			{/each}
		</div>
	</div>
	<div class="flex h-fit items-center justify-start gap-2 p-2">
		<div class="rounded-xl bg-accent p-2">
			<UserSVG color="white" />
		</div>
		<span>{$UserStore?.username}</span>
	</div>
</div>
