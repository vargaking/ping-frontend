<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Banner } from '$lib/utils/profileCard';

	let { banner, class: className }: { banner: Banner; class?: string } = $props();

	let failedSrc = $state<string | null>(null);

	const src = $derived(banner.kind === 'image' ? banner.src : null);
	const showImage = $derived(src !== null && src !== failedSrc);
	const color = $derived(banner.kind === 'color' ? banner.color : undefined);
</script>

<div
	data-banner={banner.kind}
	class={cn('w-full overflow-hidden', color || showImage ? '' : 'bg-accent', className)}
	style:background-color={color}
>
	{#if showImage && src}
		<img {src} alt="" class="h-full w-full object-cover" onerror={() => (failedSrc = src)} />
	{/if}
</div>
