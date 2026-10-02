<script lang="ts">
	import { serversState } from '$lib/states/serversState.svelte';
	import { Permission } from '$lib/permissions';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { membersPanelState } from '$lib/states/membersPanelState.svelte';
	import InviteDialog from '$lib/components/servers/InviteDialog.svelte';
	import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Hash, Volume2, Users, UserPlus, Settings } from 'lucide-svelte';

	let inviteOpen = $state(false);

	const channel = $derived(serversState.selectedChannel);
	const topic = $derived(channel?.topic ?? '');
</script>

<header class="flex h-14 shrink-0 items-center gap-3 border-b border-border pr-4 pl-6">
	<span class="text-text-subtle">
		{#if channel?.type === 'voice'}
			<Volume2 size={18} strokeWidth={1.75} />
		{:else}
			<Hash size={18} strokeWidth={1.75} />
		{/if}
	</span>
	<h1 class="text-[15px] font-semibold">{channel?.name ?? 'Select a channel'}</h1>

	{#if topic}
		<span class="h-4 w-px bg-border" aria-hidden="true"></span>
		<p class="min-w-0 truncate text-[13px] text-text-subtle">{topic}</p>
	{/if}

	<div class="ml-auto flex items-center gap-2">
		{#if channel && serversState.can(Permission.MANAGE_CHANNELS)}
			<button
				type="button"
				aria-label="Channel settings"
				onclick={() =>
					overlayState.open(SettingsModal, { category: 'channel', channelId: channel.id })}
				class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<Settings size={18} strokeWidth={1.75} />
			</button>
		{/if}
		{#if serversState.canInvite}
			<Button variant="secondary" size="sm" onclick={() => (inviteOpen = true)}>
				<UserPlus size={16} strokeWidth={1.75} />
				Invite
			</Button>
		{/if}
		<button
			type="button"
			aria-label="Toggle member list"
			aria-pressed={membersPanelState.open}
			onclick={() => membersPanelState.toggle()}
			class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {membersPanelState.open
				? 'bg-accent text-foreground'
				: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
		>
			<Users size={18} strokeWidth={1.75} />
		</button>
	</div>
</header>

<InviteDialog bind:open={inviteOpen} />
