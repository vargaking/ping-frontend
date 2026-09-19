<script lang="ts">
	import { MicOff } from 'lucide-svelte';

	type Props = {
		name: string;
		avatar?: string | null;
		speaking?: boolean;
		muted?: boolean;
	};

	let { name, avatar = null, speaking = false, muted = false }: Props = $props();
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
	<span class="min-w-0 flex-1 truncate text-[13px] text-foreground">{name}</span>
	{#if muted}
		<MicOff size={14} strokeWidth={1.75} class="shrink-0 text-text-subtle" />
	{/if}
</div>
