<script lang="ts">
	import { metaTags, THEME_COLOR, type PageMeta } from '$lib/meta';

	let { meta, themeColor = THEME_COLOR }: { meta: PageMeta; themeColor?: string } = $props();
</script>

<svelte:head>
	<title>{meta.title}</title>
	{#each metaTags(meta, themeColor) as tag (tag.key)}
		{#if tag.attr === 'name'}
			<meta name={tag.key} content={tag.content} />
		{:else}
			<meta property={tag.key} content={tag.content} />
		{/if}
	{/each}
</svelte:head>
