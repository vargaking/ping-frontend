<script lang="ts">
	import { metaTags, type PageMeta } from '$lib/meta';

	let { meta }: { meta: PageMeta } = $props();
</script>

<svelte:head>
	<title>{meta.title}</title>
	{#each metaTags(meta) as tag (tag.key)}
		{#if tag.attr === 'name'}
			<meta name={tag.key} content={tag.content} />
		{:else}
			<meta property={tag.key} content={tag.content} />
		{/if}
	{/each}
</svelte:head>
