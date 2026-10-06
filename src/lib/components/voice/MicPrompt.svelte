<script lang="ts">
	import { Mic } from '@lucide/svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';

	let allowButton = $state<HTMLButtonElement | null>(null);

	$effect(() => {
		if (voiceState.micPrompt) allowButton?.focus();
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !voiceState.micPrompt) return;
		e.preventDefault();
		voiceState.micPrompt.resolve(false);
	}
</script>

<svelte:window {onkeydown} />

<div
	class="pointer-events-none fixed right-4 bottom-4 z-40 w-80 max-w-[calc(100vw-2rem)] max-md:inset-x-3 max-md:top-(--notice-top) max-md:bottom-auto max-md:w-auto max-md:max-w-none"
	aria-live="polite"
>
	{#if voiceState.micPrompt}
		{@const prompt = voiceState.micPrompt}
		<div
			class="pointer-events-auto flex flex-col gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg"
			role="region"
			aria-label="Microphone"
		>
			<div class="flex items-start gap-3">
				<Mic class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
				<span class="text-sm font-medium">Zeta needs your microphone to talk in voice.</span>
			</div>
			<div class="flex justify-end gap-2">
				<Button size="sm" variant="ghost" onclick={() => prompt.resolve(false)}>
					Join without mic
				</Button>
				<Button size="sm" bind:ref={allowButton} onclick={() => prompt.resolve(true)}>Allow</Button>
			</div>
		</div>
	{/if}
</div>
