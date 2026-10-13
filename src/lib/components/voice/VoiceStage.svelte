<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import PresenceTile from '$lib/components/ui/voice/PresenceTile.svelte';
	import StreamTile from '$lib/components/ui/voice/StreamTile.svelte';
	import StreamVideo from '$lib/components/ui/voice/StreamVideo.svelte';
	import StreamSound from '$lib/components/ui/voice/StreamSound.svelte';
	import { voiceState, type ScreenStream } from '$lib/states/voiceState.svelte';
	import type { VoiceMember } from '$lib/states/voiceRoster.svelte';
	import { fullscreenSupported } from '$lib/utils/screenShare';
	import { Maximize2, Minimize2, EyeOff } from 'lucide-svelte';

	let {
		roster,
		screens,
		live,
		label,
		empty,
		idle
	}: {
		roster: VoiceMember[];
		screens: ScreenStream[];
		live: boolean;
		label: string;
		empty: Snippet;
		idle?: Snippet;
	} = $props();

	let focusedId = $state<string | null>(null);
	let stageVideo = $state<HTMLVideoElement | null>(null);
	// If the focused stream ends, the stage just goes away.
	const focused = $derived(screens.find((s) => s.id === focusedId) ?? null);
	const tiles = $derived(screens.filter((s) => s.id !== focusedId));

	$effect(() => {
		if (focused && voiceState.previewHidden(focused)) focusedId = null;
	});

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

	function unfocus() {
		if (document.fullscreenElement) return;
		focusedId = null;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && focusedId && !document.fullscreenElement) focusedId = null;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if roster.length === 0}
	<div class="m-auto">
		{@render empty()}
	</div>
{:else}
	<!-- Keyed each rather than #if: focused turns null before the block is torn down. -->
	{#each focused && !voiceState.previewHidden(focused) ? [focused] : [] as stream (stream.id)}
		{@const name = stream.local ? 'Your screen' : `${stream.username}'s screen`}
		<section
			aria-label={name}
			class="relative mb-3 flex min-h-0 shrink-0 justify-center rounded-xl bg-black"
		>
			<StreamVideo track={stream.track} bind:el={stageVideo} class="max-h-[70vh] rounded-xl" />
			<button
				type="button"
				aria-label="Unfocus {name}"
				onclick={unfocus}
				class="absolute inset-0 cursor-pointer rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
			></button>
			<StreamSound {stream} class="absolute top-2 left-2 max-w-[40%]" />
			<div class="absolute top-2 right-2 flex gap-2">
				{#if voiceState.mirrorsSelf(stream)}
					<Button
						variant="secondary"
						size="sm"
						class="max-md:w-11 max-md:px-0"
						onclick={() => (voiceState.selfPreview = false)}
					>
						<EyeOff size={14} strokeWidth={1.75} />
						<span class="max-md:sr-only">Hide preview</span>
					</Button>
				{:else if fullscreenSupported()}
					<Button
						variant="secondary"
						size="sm"
						class="max-md:w-11 max-md:px-0"
						onclick={() => stageVideo?.requestFullscreen()}
					>
						<Maximize2 size={14} strokeWidth={1.75} />
						<span class="max-md:sr-only">Fullscreen</span>
					</Button>
				{/if}
				<Button variant="secondary" size="sm" class="max-md:w-11 max-md:px-0" onclick={unfocus}>
					<Minimize2 size={14} strokeWidth={1.75} />
					<span class="max-md:sr-only">Exit focus</span>
				</Button>
			</div>
		</section>
	{/each}
	<ul
		aria-label={label}
		class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start gap-3 max-md:grid-cols-2"
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
			{@render idle?.()}
		</div>
	{/if}
{/if}
