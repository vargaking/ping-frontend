<script lang="ts">
	import { Search } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import SearchDialog from '$lib/components/search/SearchDialog.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { isApple } from '$lib/utils/platform';

	let apple = $state(false);
	onMount(() => (apple = isApple()));

	const hint = $derived(apple ? '⌘K' : 'Ctrl K');
</script>

<button
	type="button"
	aria-label="Search"
	aria-keyshortcuts="Control+K Meta+K"
	title="Search ({hint})"
	onclick={() => overlayState.open(SearchDialog)}
	class="flex h-8 w-56 items-center gap-2 rounded-lg border border-border bg-surface-input px-2.5 text-[13px] text-text-subtle transition-colors hover:border-border-strong hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:w-72"
>
	<Search size={15} strokeWidth={1.75} aria-hidden="true" />
	<span class="flex-1 text-left">Search</span>
	<kbd class="font-mono text-[11px] text-text-subtle">{hint}</kbd>
</button>
