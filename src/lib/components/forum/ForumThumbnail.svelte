<script lang="ts">
	import type { ForumThumbnail } from '$lib/types/forum.types';
	import { attachmentUrl } from '$lib/requests/attachments/uploadAttachment';
	import { safeHref } from '$lib/utils/linkify';
	import { MessagesSquare } from 'lucide-svelte';

	let { thumbnail, class: className = '' }: { thumbnail: ForumThumbnail | null; class?: string } =
		$props();

	let failed = $state(false);
	const embedUrl = $derived(thumbnail?.type === 'embed' ? safeHref(thumbnail.url) : null);
</script>

<div class="pointer-events-none overflow-hidden bg-accent {className}">
	{#if thumbnail?.type === 'image'}
		<img
			src={attachmentUrl(thumbnail.attachment)}
			alt=""
			loading="lazy"
			class="h-full w-full object-cover"
		/>
	{:else if thumbnail?.type === 'video'}
		<!-- The first frame stands in as the poster. -->
		<video
			src="{attachmentUrl(thumbnail.attachment)}#t=0.1"
			preload="metadata"
			muted
			playsinline
			class="h-full w-full object-cover"
		></video>
	{:else if embedUrl && !failed}
		<img
			src={embedUrl}
			alt=""
			loading="lazy"
			referrerpolicy="no-referrer"
			onerror={() => (failed = true)}
			class="h-full w-full object-cover"
		/>
	{:else}
		<div class="flex h-full w-full items-center justify-center text-text-subtle">
			<MessagesSquare size={28} strokeWidth={1.5} />
		</div>
	{/if}
</div>
