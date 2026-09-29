<script lang="ts">
	import { MicOff, HeadphoneOff } from 'lucide-svelte';

	type Props = {
		name: string;
		avatar?: string | null;
		speaking?: boolean;
		muted?: boolean;
		deafened?: boolean;
		streaming?: boolean;
	};

	let {
		name,
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
		class="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-accent text-[10px] font-semibold {speaking
			? 'ring-2 ring-online ring-offset-1 ring-offset-sidebar'
			: ''}"
	>
		{#if avatar}
			<img src={avatar} alt="" class="h-full w-full object-cover" />
		{:else}
			{name.charAt(0).toUpperCase()}
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
