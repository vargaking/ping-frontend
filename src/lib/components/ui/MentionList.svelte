<script lang="ts">
	import type { User } from '$lib/types/auth.types';
	import { selectionIndex } from '$lib/utils/mentions';

	let { items, query, command: cb }: { items: User[]; query: string; command: any } = $props();
	let selectedId = $state<number | null>(null);
	const selectedIndex = $derived(selectionIndex(items, selectedId));

	function move(step: number) {
		if (items.length === 0) return;
		selectedId = items[(selectedIndex + step + items.length) % items.length].id;
	}

	export function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'ArrowUp') {
			move(-1);
			return true;
		}
		if (event.key === 'ArrowDown') {
			move(1);
			return true;
		}
		if (event.key === 'Enter') {
			selectItem(selectedIndex);
			return true;
		}
		return false;
	}

	$effect(() => {
		void query;
		selectedId = null;
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
				onmouseenter={() => (selectedId = item.id)}
				onclick={() => selectItem(index)}
			>
				@{item.username}
			</button>
		{/each}
	{/if}
</div>
