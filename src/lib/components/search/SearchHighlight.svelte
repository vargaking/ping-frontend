<script lang="ts">
	import type { TextPart } from '$lib/utils/messageSearch';

	let { parts }: { parts: TextPart[] } = $props();
</script>

{#each parts as part, i (i)}{#if part.hit}<mark class="rounded-sm bg-primary/20 text-foreground"
			>{part.text}</mark
		>{:else}{part.text}{/if}{/each}
