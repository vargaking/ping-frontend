<script lang="ts">
	import type { ScreenStream } from '$lib/states/voiceState.svelte';
	import StreamVideo from './StreamVideo.svelte';
	import { Maximize2 } from 'lucide-svelte';

	type Props = {
		stream: ScreenStream;
		onfocus: () => void;
	};

	let { stream, onfocus }: Props = $props();

	let video = $state<HTMLVideoElement | null>(null);

	const name = $derived(stream.local ? 'Your screen' : `${stream.username}'s screen`);
</script>

<li class="group relative aspect-video min-w-0 overflow-hidden rounded-xl bg-black">
	<StreamVideo track={stream.track} bind:el={video} />
	<button
		type="button"
		aria-label="Focus {name}"
		onclick={onfocus}
		ondblclick={() => video?.requestFullscreen()}
		class="absolute inset-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
	></button>
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
	<button
		type="button"
		aria-label="Fullscreen {name}"
		onclick={() => video?.requestFullscreen()}
		class="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		<Maximize2 size={14} strokeWidth={1.75} />
	</button>
</li>
