<script lang="ts">
	import type { ForumTag } from '$lib/types/forum.types';

	let {
		tag,
		selected = false,
		onclick
	}: { tag: ForumTag; selected?: boolean; onclick?: () => void } = $props();

	const base =
		'inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs';
</script>

{#snippet inner()}
	<span
		class="h-2 w-2 shrink-0 rounded-full bg-text-subtle"
		style:background-color={tag.color ?? undefined}
		aria-hidden="true"
	></span>
	<span class="truncate">{tag.name}</span>
{/snippet}

{#if onclick}
	<button
		type="button"
		aria-pressed={selected}
		{onclick}
		class="{base} transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-8 {selected
			? 'border-primary bg-accent text-foreground'
			: 'border-border text-muted-foreground hover:bg-card hover:text-foreground'}"
	>
		{@render inner()}
	</button>
{:else}
	<span class="{base} border-border text-muted-foreground">
		{@render inner()}
	</span>
{/if}
