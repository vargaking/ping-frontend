<script lang="ts">
	import type { Embed } from '$lib/types/messages.types';
	import { safeHref } from '$lib/utils/linkify';

	let { embed, compact = false }: { embed: Embed; compact?: boolean } = $props();

	const href = $derived(safeHref(embed.url));
	// Shown whatever the sender wrote as site name, so the card can't hide where it goes.
	const domain = $derived(href ? new URL(href).hostname : '');
	const image = $derived(safeHref(embed.image_url));
	const heading = $derived(embed.title ?? domain);
	let imageFailed = $state(false);
</script>

{#if href}
	<div
		class="flex max-w-[432px] min-w-0 gap-3 rounded-lg border border-l-4 border-border border-l-primary bg-card p-3"
	>
		<div class="min-w-0 flex-1">
			<div class="truncate text-xs text-text-subtle">
				{domain}{#if embed.site_name && embed.site_name !== domain}
					<span aria-hidden="true" class="mx-1">·</span>{embed.site_name}{/if}
			</div>
			<a
				{href}
				target="_blank"
				rel="noopener noreferrer nofollow ugc"
				class="mt-0.5 block text-sm font-semibold break-words text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {compact
					? 'line-clamp-1'
					: 'line-clamp-2'}"
			>
				{heading}
			</a>
			{#if embed.description}
				<p
					class="mt-1 text-[13px] leading-snug break-words text-text-body {compact
						? 'line-clamp-2'
						: 'line-clamp-3'}"
				>
					{embed.description}
				</p>
			{/if}
		</div>
		{#if image && !imageFailed}
			<img
				src={image}
				alt=""
				loading="lazy"
				referrerpolicy="no-referrer"
				onerror={() => (imageFailed = true)}
				class="shrink-0 rounded-md bg-accent object-cover {compact ? 'h-12 w-12' : 'h-20 w-20'}"
			/>
		{/if}
	</div>
{/if}
