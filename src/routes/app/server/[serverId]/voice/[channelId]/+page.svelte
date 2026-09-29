<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import ChannelHeader from '$lib/components/ui/message/ChannelHeader.svelte';
	import UsersSidebar from '$lib/components/ui/sidebar/UsersSidebar.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import VoiceTile from '$lib/components/ui/voice/VoiceTile.svelte';
	import PresenceTile from '$lib/components/ui/voice/PresenceTile.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { voicePresenceState } from '$lib/states/voicePresenceState.svelte';
	import { Volume2 } from 'lucide-svelte';

	let membersOpen = $state(true);

	const channelId = $derived(page.params.channelId ? parseInt(page.params.channelId) : null);
	const channel = $derived(
		channelId != null ? (serversState.selectedServerChannels[channelId] ?? null) : null
	);
	const channelsLoaded = $derived(serversState.selectedServerChannelsList.length > 0);

	const inThisCall = $derived(channelId != null && voiceState.channelId === channelId);
	const live = $derived(inThisCall && voiceState.connected);
	const peers = $derived(live ? Array.from(voiceState.peers.values()) : []);
	const present = $derived(
		!live && channelId != null ? voicePresenceState.participants(channelId) : []
	);
	const empty = $derived(peers.length === 0 && present.length === 0);

	$effect(() => {
		const id = channelId;
		if (id == null || !channel) return;
		if (channel.type !== 'voice') {
			untrack(() =>
				goto(`/app/server/${page.params.serverId}/channel/${id}/`, { replaceState: true })
			);
			return;
		}
		untrack(() => serversState.setSelectedChannelById(id));
	});

	function join() {
		if (channelId != null && !inThisCall) voiceState.joinVoice(channelId);
	}
</script>

{#snippet joinButton()}
	<Button onclick={join} disabled={inThisCall}>
		{inThisCall ? 'Connecting…' : 'Join voice'}
	</Button>
{/snippet}

<div class="flex h-full min-h-0">
	<div class="flex min-w-0 flex-1 flex-col">
		<ChannelHeader {membersOpen} onToggleMembers={() => (membersOpen = !membersOpen)} />

		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 scrollbar-stable">
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
			{:else if empty}
				<div class="m-auto">
					<EmptyState
						title="No one's here yet"
						description={inThisCall ? undefined : 'Join to start talking.'}
						action={live ? undefined : joinButton}
					>
						{#snippet icon()}
							<Volume2 size={20} strokeWidth={1.75} />
						{/snippet}
					</EmptyState>
				</div>
			{:else}
				<ul
					aria-label="In {channel.name}"
					class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start gap-3"
				>
					{#each peers as peer (peer.id)}
						<VoiceTile
							name={peer.username}
							avatar={peer.profile?.avatar}
							speaking={peer.isSpeaking}
							muted={peer.muted}
							deafened={peer.deafened}
						/>
					{/each}
					{#each present as participant (participant.user_id)}
						<PresenceTile
							userId={participant.user_id}
							muted={participant.muted}
							deafened={participant.deafened}
						/>
					{/each}
				</ul>
				{#if !live}
					<div class="mt-6 flex justify-center">
						{@render joinButton()}
					</div>
				{/if}
			{/if}
		</div>
	</div>

	{#if membersOpen}
		<UsersSidebar />
	{/if}
</div>
