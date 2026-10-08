<script lang="ts">
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { voicePeerAudioState } from '$lib/states/voicePeerAudioState.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';

	let { userId, name }: { userId: number; name: string } = $props();

	const percent = $derived(Math.round(voicePeerAudioState.get(userId).volume * 100));
</script>

<div class="w-[min(360px,90vw)] bg-background p-6">
	<h2 class="text-base font-semibold text-foreground">Volume for {name}</h2>
	<p class="mt-2 text-sm text-muted-foreground">Only you hear the change, on this device.</p>

	<div class="mt-5 flex items-center gap-3">
		<input
			type="range"
			min="0"
			max="100"
			step="5"
			value={percent}
			aria-label="Volume for {name}"
			oninput={(e) => voiceState.setPeerVolume(userId, e.currentTarget.valueAsNumber / 100)}
			class="h-2 min-w-0 flex-1 cursor-pointer accent-primary pointer-coarse:h-8"
		/>
		<span class="w-10 shrink-0 text-right text-sm text-foreground tabular-nums">{percent}%</span>
	</div>

	<div class="mt-6 flex justify-end">
		<button
			type="button"
			onclick={() => overlayState.close()}
			class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:py-3"
		>
			Done
		</button>
	</div>
</div>
