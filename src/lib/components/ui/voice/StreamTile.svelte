<script lang="ts">
	import { voiceState, type ScreenStream } from '$lib/states/voiceState.svelte';
	import StreamVideo from './StreamVideo.svelte';
	import StreamSound from './StreamSound.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { fullscreenSupported } from '$lib/utils/screenShare';
	import { Maximize2, EyeOff, MonitorUp } from 'lucide-svelte';

	type Props = {
		stream: ScreenStream;
		onfocus: () => void;
	};

	let { stream, onfocus }: Props = $props();

	let video = $state<HTMLVideoElement | null>(null);

	const name = $derived(stream.local ? 'Your screen' : `${stream.username}'s screen`);
	const hidden = $derived(voiceState.previewHidden(stream));
	const mirrors = $derived(voiceState.mirrorsSelf(stream));
	const canHide = $derived(mirrors && !hidden);
	const canFullscreen = fullscreenSupported();

	const overlayButton =
		'absolute top-2 flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:opacity-100 pointer-coarse:before:absolute pointer-coarse:before:-inset-2';
</script>

<li class="group relative aspect-video min-w-0 overflow-hidden rounded-xl bg-black">
	{#if hidden}
		<div class="flex h-full flex-col items-center justify-center gap-2 p-4 pb-9 text-center">
			<MonitorUp size={28} strokeWidth={1.5} class="text-muted-foreground" />
			<p class="text-sm text-foreground">You're sharing your screen</p>
			<Button variant="secondary" size="sm" onclick={() => (voiceState.selfPreview = true)}>
				Show preview
			</Button>
		</div>
	{:else}
		<StreamVideo track={stream.track} bind:el={video} />
		<button
			type="button"
			aria-label="Focus {name}"
			onclick={onfocus}
			ondblclick={mirrors || !canFullscreen ? undefined : () => video?.requestFullscreen()}
			class="absolute inset-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
		></button>
	{/if}
	<StreamSound {stream} class="absolute top-2 left-2 z-10" />
	<div
		class="pointer-events-none absolute right-2 bottom-2 left-2 flex items-center justify-between gap-2"
		aria-hidden="true"
	>
		<span
			class="min-w-0 truncate rounded-md bg-background/80 px-2 py-0.5 text-[13px] text-foreground"
		>
			{name}
		</span>
		<span
			class="shrink-0 rounded-md bg-destructive px-1.5 py-0.5 text-[11px] font-semibold text-white"
		>
			LIVE
		</span>
	</div>
	{#if !mirrors && canFullscreen}
		<button
			type="button"
			aria-label="Fullscreen {name}"
			onclick={() => video?.requestFullscreen()}
			class="{overlayButton} right-2"
		>
			<Maximize2 size={14} strokeWidth={1.75} />
		</button>
	{/if}
	{#if canHide}
		<button
			type="button"
			aria-label="Hide preview"
			onclick={() => (voiceState.selfPreview = false)}
			class="{overlayButton} right-2"
		>
			<EyeOff size={14} strokeWidth={1.75} />
		</button>
	{/if}
</li>
