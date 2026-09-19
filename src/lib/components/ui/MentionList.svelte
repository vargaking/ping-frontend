<script lang="ts">
	import type { User } from '$lib/types/auth.types';

	let { items, command: cb }: { items: User[]; command: any } = $props();
	let selectedIndex = $state(0);

	export function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'ArrowUp') {
			selectedIndex = (selectedIndex + items.length - 1) % items.length;
			return true;
		}
		if (event.key === 'ArrowDown') {
			selectedIndex = (selectedIndex + 1) % items.length;
			return true;
		}
		if (event.key === 'Enter') {
			selectItem(selectedIndex);
			return true;
		}
		return false;
	}

	$effect(() => {
		if (items.length >= 0) {
			selectedIndex = 0;
		}
	});

	function selectItem(index: number) {
		const item = items[index];
		if (item) {
			cb({ id: item.id.toString(), label: item.username });
		}
	}
</script>

<div
	class="min-w-[150px] overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl"
>
	{#if items.length > 0}
		{#each items as item, index}
			<button
				class="w-full px-3 py-2 text-left text-sm transition-colors {index === selectedIndex
					? 'bg-primary/15 text-primary'
					: 'text-primary hover:bg-accent'}"
				onmouseenter={() => (selectedIndex = index)}
				onclick={() => selectItem(index)}
			>
				@{item.username}
			</button>
		{/each}
	{/if}
</div>
