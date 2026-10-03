<script lang="ts">
	import { serversState } from '$lib/states/serversState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { membersPanelState } from '$lib/states/membersPanelState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { voiceRoster } from '$lib/states/voiceRoster.svelte';
	import { Permission } from '$lib/permissions';
	import { avatarToneClass, initials } from '$lib/utils/avatar';
	import type { Channel } from '$lib/types/channel.types';
	import InviteDialog from '$lib/components/servers/InviteDialog.svelte';
	import CreateChannelDialog from '$lib/components/servers/CreateChannelDialog.svelte';
	import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
	import ServerIcon from '$lib/components/ui/avatar/ServerIcon.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Hash, Volume2, Users, UserPlus, Settings, Plus } from 'lucide-svelte';

	const server = $derived(serversState.selectedServer);
	const channels = $derived(serversState.selectedServerChannelsList);
	const textChannels = $derived(channels.filter((c) => c.type === 'text'));
	const voiceChannels = $derived(channels.filter((c) => c.type === 'voice'));
	const welcomeMessage = $derived(server?.server_profile?.welcome_message?.trim());
	const canManageChannels = $derived(serversState.can(Permission.MANAGE_CHANNELS));
	const canManageServer = $derived(serversState.can(Permission.MANAGE_SERVER));

	let inviteOpen = $state(false);
	let createOpen = $state(false);

	function href(channel: Channel) {
		const route = channel.type === 'text' ? 'channel' : 'voice';
		return `/app/server/${server?.id}/${route}/${channel.id}/`;
	}

	const rowClass =
		'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
</script>

{#snippet channelRow(channel: Channel)}
	{@const members = channel.type === 'voice' ? voiceRoster(channel.id) : []}
	<li>
		<a href={href(channel)} class={rowClass}>
			<span class="shrink-0 text-text-subtle">
				{#if channel.type === 'voice'}
					<Volume2 size={18} strokeWidth={1.75} />
				{:else}
					<Hash size={18} strokeWidth={1.75} />
				{/if}
			</span>
			<span class="min-w-0 flex-1">
				<span class="block truncate font-medium">{channel.name}</span>
				{#if channel.topic?.trim()}
					<span class="block truncate text-[13px] text-text-subtle">{channel.topic}</span>
				{/if}
			</span>
			{#if members.length > 0}
				<span class="flex shrink-0 items-center gap-2 text-[13px] text-text-subtle">
					<span class="flex -space-x-1.5">
						{#each members.slice(0, 4) as member (member.userId)}
							{@const user = usersState.users[member.userId]}
							{@const name = user?.username ?? member.fallbackName ?? '?'}
							{@const avatar = user?.profile?.avatar ?? member.fallbackAvatar}
							<span
								title={name}
								class="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold ring-2 ring-background {avatar
									? 'bg-accent'
									: avatarToneClass(member.userId)}"
							>
								{#if avatar}
									<img src={avatar} alt="" class="h-full w-full object-cover" />
								{:else}
									{initials(name)}
								{/if}
							</span>
						{/each}
					</span>
					<span>{members.length} in voice</span>
				</span>
			{/if}
		</a>
	</li>
{/snippet}

{#snippet channelGroup(title: string, list: Channel[])}
	{#if list.length > 0}
		<section aria-label={title}>
			<h2 class="mb-1 px-3 text-xs font-medium tracking-[0.02em] text-text-subtle">{title}</h2>
			<ul class="flex flex-col">
				{#each list as channel (channel.id)}
					{@render channelRow(channel)}
				{/each}
			</ul>
		</section>
	{/if}
{/snippet}

{#if server}
	<div class="mx-auto flex w-full max-w-[640px] flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
		<header class="flex flex-col items-center gap-4 text-center">
			<ServerIcon
				name={server.name}
				serverId={server.id ?? server.name}
				iconUrl={server.server_profile?.icon ?? null}
				iconText={server.icon_text ?? null}
				iconTone={server.icon_tone ?? null}
				class="h-20 w-20 rounded-[20px] text-3xl"
			/>
			<div class="flex flex-col gap-2">
				<h1 class="text-2xl font-semibold break-words">{server.name}</h1>
				<p class="text-[15px] break-words whitespace-pre-line text-muted-foreground">
					{welcomeMessage || `Welcome to ${server.name}`}
				</p>
			</div>
		</header>

		<div class="flex flex-wrap justify-center gap-2">
			{#if serversState.canInvite && channels.length > 0}
				<Button onclick={() => (inviteOpen = true)}>
					<UserPlus size={16} strokeWidth={1.75} />
					Invite people
				</Button>
			{/if}
			<Button
				variant="secondary"
				aria-pressed={membersPanelState.open}
				onclick={() => membersPanelState.toggle()}
			>
				<Users size={16} strokeWidth={1.75} />
				Members
			</Button>
			{#if canManageServer}
				<Button
					variant="secondary"
					onclick={() => overlayState.open(SettingsModal, { category: 'server' })}
				>
					<Settings size={16} strokeWidth={1.75} />
					Server settings
				</Button>
			{/if}
		</div>

		{#if channels.length === 0}
			<EmptyState
				dashed
				title="This server has no channels yet"
				description={canManageChannels
					? 'Create the first channel, then invite people to join.'
					: 'Channels will show up here once someone creates them.'}
			>
				{#snippet icon()}<Hash size={20} strokeWidth={1.75} />{/snippet}
				{#snippet action()}
					<div class="flex flex-wrap justify-center gap-2">
						{#if canManageChannels}
							<Button onclick={() => (createOpen = true)}>
								<Plus size={16} strokeWidth={1.75} />
								Create a channel
							</Button>
						{/if}
						{#if serversState.canInvite}
							<Button
								variant={canManageChannels ? 'secondary' : 'default'}
								onclick={() => (inviteOpen = true)}
							>
								<UserPlus size={16} strokeWidth={1.75} />
								Invite people
							</Button>
						{/if}
					</div>
				{/snippet}
			</EmptyState>
		{:else}
			<div class="flex flex-col gap-5">
				{@render channelGroup('Text channels', textChannels)}
				{@render channelGroup('Voice channels', voiceChannels)}
			</div>
		{/if}
	</div>

	<InviteDialog bind:open={inviteOpen} />
	<CreateChannelDialog bind:open={createOpen} />
{/if}
