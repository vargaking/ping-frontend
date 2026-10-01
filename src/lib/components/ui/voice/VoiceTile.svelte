<script lang="ts">
	import { avatarToneClass, initials } from '$lib/utils/avatar';
	import type { Snippet } from 'svelte';
	import { MicOff, HeadphoneOff } from 'lucide-svelte';

	type Props = {
		name: string;
		/** Stable key (the user id) for the default avatar colour. */
		toneKey: number | string;
		/** Name to take initials from when `name` carries a suffix like "(You)". */
		initialsFrom?: string;
		avatar?: string | null;
		speaking?: boolean;
		muted?: boolean;
		deafened?: boolean;
		streaming?: boolean;
		/** A video or screen-share stream. Replaces the avatar and fills the tile. */
		media?: Snippet;
	};

	let {
		name,
		toneKey,
		initialsFrom,
		avatar = null,
		speaking = false,
		muted = false,
		deafened = false,
		streaming = false,
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
			class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-2xl font-semibold {avatar
				? 'bg-accent'
				: avatarToneClass(toneKey)}"
		>
			{#if avatar}
				<img src={avatar} alt="" class="h-full w-full object-cover" />
			{:else}
				{initials(initialsFrom ?? name)}
			{/if}
		</span>
	{/if}

	<div
		class="absolute right-2 bottom-2 left-2 flex items-center justify-between gap-2"
		aria-hidden="true"
	>
		<span class="flex min-w-0 items-center gap-1.5">
			<span
				class="min-w-0 truncate rounded-md bg-background/80 px-2 py-0.5 text-[13px] text-foreground"
			>
				{name}
			</span>
			{#if streaming}
				<span
					class="shrink-0 rounded-md bg-destructive px-1.5 py-0.5 text-[11px] font-semibold text-white"
				>
					LIVE
				</span>
			{/if}
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
