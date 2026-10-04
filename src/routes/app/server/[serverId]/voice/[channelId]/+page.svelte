<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import ChannelHeader from '$lib/components/ui/message/ChannelHeader.svelte';
	import UsersSidebar from '$lib/components/ui/sidebar/UsersSidebar.svelte';
	import { membersPanelState } from '$lib/states/membersPanelState.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import PresenceTile from '$lib/components/ui/voice/PresenceTile.svelte';
	import StreamTile from '$lib/components/ui/voice/StreamTile.svelte';
	import StreamVideo from '$lib/components/ui/voice/StreamVideo.svelte';
	import StreamSound from '$lib/components/ui/voice/StreamSound.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { voiceRoster } from '$lib/states/voiceRoster.svelte';
	import { Volume2, Maximize2, Minimize2, EyeOff } from 'lucide-svelte';

	const channelId = $derived(page.params.channelId ? parseInt(page.params.channelId) : null);
	const channel = $derived(
		channelId != null ? (serversState.selectedServerChannels[channelId] ?? null) : null
	);
	const channelsLoaded = $derived(serversState.selectedServerChannelsLoaded);

	const inThisCall = $derived(channelId != null && voiceState.channelId === channelId);
	const live = $derived(inThisCall && voiceState.connected);
	const roster = $derived(channelId != null ? voiceRoster(channelId) : []);
	const screens = $derived(live ? Array.from(voiceState.screens.values()) : []);
	let focusedId = $state<string | null>(null);
	let stageVideo = $state<HTMLVideoElement | null>(null);
	// If the focused stream ends, the stage just goes away.
	const focused = $derived(screens.find((s) => s.id === focusedId) ?? null);
	const tiles = $derived(screens.filter((s) => s.id !== focusedId));

	$effect(() => {
		if (focused && voiceState.previewHidden(focused)) focusedId = null;
	});
	const empty = $derived(roster.length === 0);

	// A lone remote stream is focused when it first appears; your own preview never is.
	let seenStreams = new Set<string>();
	$effect(() => {
		const ids = new Set(screens.map((s) => s.id));
		const fresh = screens.filter((s) => !seenStreams.has(s.id));
		seenStreams = ids;
		untrack(() => {
			if (focusedId == null && screens.length === 1 && !fresh[0]?.local) {
				focusedId = fresh[0]?.id ?? null;
			}
		});
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && focusedId && !document.fullscreenElement) focusedId = null;
	}

	$effect(() => {
		const id = channelId;
		if (id == null) return;
		untrack(() => serversState.setSelectedChannelId(id));
		if (!channel) return;
		if (channel.type !== 'voice') {
			untrack(() =>
				goto(`/app/server/${page.params.serverId}/channel/${id}/`, { replaceState: true })
			);
			return;
		}
	});

	function join() {
		const serverId = page.params.serverId ? parseInt(page.params.serverId) : null;
		if (serverId != null && channelId != null && !inThisCall) {
			voiceState.joinVoice(serverId, channelId);
		}
	}
</script>

{#snippet joinButton()}
	<Button onclick={join} disabled={inThisCall}>
		{inThisCall ? 'Connecting…' : 'Join voice'}
	</Button>
{/snippet}

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full min-h-0">
	<div class="flex min-w-0 flex-1 flex-col">
		<ChannelHeader />

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
				<!-- Keyed each rather than #if: focused turns null before the block is torn down. -->
				{#each focused && !voiceState.previewHidden(focused) ? [focused] : [] as stream (stream.id)}
					<section
						aria-label="{stream.local ? 'Your' : `${stream.username}'s`} screen"
						class="relative mb-3 flex min-h-0 shrink-0 justify-center rounded-xl bg-black"
					>
						<StreamVideo
							track={stream.track}
							bind:el={stageVideo}
							class="max-h-[70vh] rounded-xl"
						/>
						<StreamSound {stream} class="absolute top-2 left-2 max-w-[40%]" />
						<div class="absolute top-2 right-2 flex gap-2">
							{#if voiceState.mirrorsSelf(stream)}
								<Button
									variant="secondary"
									size="sm"
									onclick={() => (voiceState.selfPreview = false)}
								>
									<EyeOff size={14} strokeWidth={1.75} />
									Hide preview
								</Button>
							{:else}
								<Button
									variant="secondary"
									size="sm"
									onclick={() => stageVideo?.requestFullscreen()}
								>
									<Maximize2 size={14} strokeWidth={1.75} />
									Fullscreen
								</Button>
							{/if}
							<Button variant="secondary" size="sm" onclick={() => (focusedId = null)}>
								<Minimize2 size={14} strokeWidth={1.75} />
								Exit focus
							</Button>
						</div>
					</section>
				{/each}
				<ul
					aria-label="In {channel.name}"
					class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start gap-3"
				>
					{#each tiles as stream (stream.id)}
						<StreamTile {stream} onfocus={() => (focusedId = stream.id)} />
					{/each}
					{#each roster as member (member.userId)}
						<PresenceTile {member} />
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

	{#if membersPanelState.open}
		<UsersSidebar />
	{/if}
</div>
