<script lang="ts">
	import { initials, serverToneClass } from '$lib/utils/avatar';

	type Props = {
		name: string;
		serverId: number | string;
		iconUrl?: string | null;
		iconText?: string | null;
		iconTone?: number | null;
		class?: string;
	};

	let {
		name,
		serverId,
		iconUrl = null,
		iconText = null,
		iconTone = null,
		class: className = ''
	}: Props = $props();

	const toneClass = $derived(iconUrl ? 'bg-card' : serverToneClass(serverId, iconText, iconTone));
</script>

<span
	class="flex shrink-0 items-center justify-center overflow-hidden leading-none font-semibold {toneClass} {className}"
>
	{#if iconUrl}
		<img src={iconUrl} alt="" class="h-full w-full object-cover" />
	{:else if iconText}
		{iconText}
	{:else}
		{initials(name)}
	{/if}
</span>
