<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MicOff, HeadphoneOff } from 'lucide-svelte';

	type Props = {
		name: string;
		avatar?: string | null;
		speaking?: boolean;
		muted?: boolean;
		deafened?: boolean;
		/** A video or screen-share stream. Replaces the avatar and fills the tile. */
		media?: Snippet;
	};

	let {
		name,
		avatar = null,
		speaking = false,
		muted = false,
		deafened = false,
		media
	}: Props = $props();

	const stateLabel = $derived(deafened ? ', deafened' : muted ? ', muted' : '');
</script>

<li
	class="relative flex aspect-video min-w-0 items-center justify-center overflow-hidden rounded-xl bg-card transition-shadow {speaking
		? 'ring-2 ring-online'
		: ''}"
	aria-label="{name}{stateLabel}"
>
	{#if media}
		{@render media()}
	{:else}
		<span
			class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-accent text-2xl font-semibold text-text-label"
		>
			{#if avatar}
				<img src={avatar} alt="" class="h-full w-full object-cover" />
			{:else}
				{name.charAt(0).toUpperCase()}
			{/if}
		</span>
	{/if}

	<div
		class="absolute right-2 bottom-2 left-2 flex items-center justify-between gap-2"
		aria-hidden="true"
	>
		<span
			class="min-w-0 truncate rounded-md bg-background/80 px-2 py-0.5 text-[13px] text-foreground"
		>
			{name}
		</span>
		{#if muted || deafened}
			<span
				class="flex shrink-0 items-center gap-1 rounded-md bg-background/80 px-1.5 py-1 text-text-subtle"
			>
				<MicOff size={14} strokeWidth={1.75} />
				{#if deafened}
					<HeadphoneOff size={14} strokeWidth={1.75} />
				{/if}
			</span>
		{/if}
	</div>
</li>
