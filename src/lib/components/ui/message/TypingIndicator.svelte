<script lang="ts">
	// Height is always reserved (18px row) so the list does not jump when
	// someone starts or stops typing (UI spec §4).
	let { names = [] }: { names?: string[] } = $props();

	const label = $derived(
		names.length === 0
			? ''
			: names.length === 1
				? `${names[0]} is typing`
				: names.length === 2
					? `${names[0]} and ${names[1]} are typing`
					: 'Several people are typing'
	);
</script>

<div class="flex h-[18px] items-center gap-2 px-8 text-xs text-text-subtle" aria-live="polite">
	{#if names.length > 0}
		<span class="flex items-center gap-0.5" aria-hidden="true">
			<span class="h-1 w-1 rounded-full bg-text-subtle opacity-90"></span>
			<span class="h-1 w-1 rounded-full bg-text-subtle opacity-60"></span>
			<span class="h-1 w-1 rounded-full bg-text-subtle opacity-30"></span>
		</span>
		<span class="truncate">{label}</span>
	{/if}
</div>
