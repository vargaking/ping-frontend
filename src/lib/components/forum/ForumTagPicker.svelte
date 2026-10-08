<script lang="ts">
	import type { ForumTag } from '$lib/types/forum.types';
	import { POST_TAGS_MAX } from '$lib/types/forum.types';
	import ForumTagChip from './ForumTagChip.svelte';

	let { tags, selected = $bindable([]) }: { tags: ForumTag[]; selected: number[] } = $props();

	const full = $derived(selected.length >= POST_TAGS_MAX);

	function toggle(id: number) {
		if (selected.includes(id)) selected = selected.filter((s) => s !== id);
		else if (!full) selected = [...selected, id];
	}
</script>

{#if tags.length > 0}
	<div class="flex flex-col gap-1.5">
		<span class="text-[13px] font-medium text-text-label">Tags</span>
		<div class="flex flex-wrap gap-1.5">
			{#each tags as tag (tag.id)}
				<ForumTagChip {tag} selected={selected.includes(tag.id)} onclick={() => toggle(tag.id)} />
			{/each}
		</div>
		{#if full}
			<p class="text-xs text-text-subtle">A post can have up to {POST_TAGS_MAX} tags.</p>
		{/if}
	</div>
{/if}
