<script lang="ts">
	import { avatarToneClass, initials } from '$lib/utils/avatar';
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
	};

	let {
		name,
		toneKey,
		initialsFrom,
		avatar = null,
		speaking = false,
		muted = false,
		deafened = false,
		streaming = false
	}: Props = $props();

	const stateLabel = $derived(deafened ? ', deafened' : muted ? ', muted' : '');
</script>

<div class="flex h-7 items-center gap-2 pl-[34px]">
	<span
		class="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold {avatar
			? 'bg-accent'
			: avatarToneClass(toneKey)} {speaking
			? 'ring-2 ring-online ring-offset-1 ring-offset-sidebar'
			: ''}"
	>
		{#if avatar}
			<img src={avatar} alt="" class="h-full w-full object-cover" />
		{:else}
			{initials(initialsFrom ?? name)}
		{/if}
	</span>
	<span class="min-w-0 flex-1 truncate text-[13px] text-foreground">
		{name}{#if stateLabel}<span class="sr-only">{stateLabel}</span>{/if}
	</span>
	{#if streaming}
		<span
			class="shrink-0 rounded bg-destructive px-1 text-[10px] leading-4 font-semibold text-white"
		>
			LIVE
		</span>
	{/if}
	{#if muted || deafened}
		<MicOff size={14} strokeWidth={1.75} class="shrink-0 text-text-subtle" aria-hidden="true" />
	{/if}
	{#if deafened}
		<HeadphoneOff
			size={14}
			strokeWidth={1.75}
			class="shrink-0 text-text-subtle"
			aria-hidden="true"
		/>
	{/if}
</div>
