<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import ChannelHeader from '$lib/components/ui/message/ChannelHeader.svelte';
	import UsersSidebar from '$lib/components/ui/sidebar/UsersSidebar.svelte';
	import { membersPanelState } from '$lib/states/membersPanelState.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { Permission } from '$lib/permissions';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { voiceRoster } from '$lib/states/voiceRoster.svelte';
	import { channelPath } from '$lib/utils/channelRoutes';
	import VoiceStage from '$lib/components/voice/VoiceStage.svelte';
	import { Volume2 } from 'lucide-svelte';

	const channelId = $derived(page.params.channelId ? parseInt(page.params.channelId) : null);
	const channel = $derived(
		channelId != null ? (serversState.selectedServerChannels[channelId] ?? null) : null
	);
	const channelsLoaded = $derived(serversState.selectedServerChannelsLoaded);

	const inThisCall = $derived(channelId != null && voiceState.channelId === channelId);
	const mayConnect = $derived(
		serversState.canIn(Permission.CONNECT, channelId, serversState.selectedServerId)
	);
	const live = $derived(inThisCall && voiceState.connected);
	const roster = $derived(channelId != null ? voiceRoster(channelId) : []);
	const screens = $derived(live ? Array.from(voiceState.screens.values()) : []);

	$effect(() => {
		const id = channelId;
		if (id == null) return;
		untrack(() => serversState.setSelectedChannelId(id));
		if (!channel) return;
		if (channel.type !== 'voice') {
			untrack(() =>
				goto(channelPath(Number(page.params.serverId), channel), { replaceState: true })
			);
		}
	});

	function join() {
		const serverId = page.params.serverId ? parseInt(page.params.serverId) : null;
		if (serverId != null && channelId != null && !inThisCall && mayConnect) {
			voiceState.joinVoice(serverId, channelId);
		}
	}
</script>

{#snippet joinButton()}
	<Button onclick={join} disabled={inThisCall || !mayConnect}>
		{inThisCall ? 'Connecting…' : 'Join voice'}
	</Button>
	{#if !mayConnect}
		<p class="text-sm text-muted-foreground">You can't join this voice channel.</p>
	{/if}
{/snippet}

{#snippet empty()}
	<EmptyState
		title="No one's here yet"
		description={inThisCall ? undefined : 'Join to start talking.'}
		action={live ? undefined : joinButton}
	>
		{#snippet icon()}
			<Volume2 size={20} strokeWidth={1.75} />
		{/snippet}
	</EmptyState>
{/snippet}

<div class="flex h-full min-h-0">
	<div class="flex min-w-0 flex-1 flex-col">
		<ChannelHeader />

		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 scrollbar-stable max-md:p-3">
			{#if !channel}
				{#if channelsLoaded}
					<div class="m-auto">
						<EmptyState title="Channel not found" description="It may have been deleted.">
							{#snippet icon()}
								<Volume2 size={20} strokeWidth={1.75} />
							{/snippet}
						</EmptyState>
					</div>
				{/if}
			{:else}
				<VoiceStage {roster} {screens} {live} label="In {channel.name}" {empty} idle={joinButton} />
			{/if}
		</div>
	</div>

	{#if membersPanelState.open}
		<UsersSidebar />
	{/if}
</div>
