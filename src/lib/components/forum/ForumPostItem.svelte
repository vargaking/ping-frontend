<script lang="ts">
	import type { ForumPost, ForumTag } from '$lib/types/forum.types';
	import AuthorName from '$lib/components/ui/message/AuthorName.svelte';
	import ForumTagChip from './ForumTagChip.svelte';
	import ForumThumbnail from './ForumThumbnail.svelte';
	import { authorName, tagsOf } from '$lib/utils/forum';
	import { postPath } from '$lib/utils/channelRoutes';
	import { timeAgo } from '$lib/utils/timeAgo';
	import { Lock, MessageSquare, Pin } from 'lucide-svelte';

	import type { HTMLAnchorAttributes } from 'svelte/elements';

	let {
		post,
		serverId,
		tags,
		layout,
		...rest
	}: {
		post: ForumPost;
		serverId: number;
		tags: ForumTag[];
		layout: 'list' | 'gallery';
	} & HTMLAnchorAttributes = $props();

	const postTags = $derived(tagsOf(post, tags));
	const href = $derived(postPath(serverId, post.channel_id, post.id));
</script>

{#snippet badges()}
	{#if post.pinned}
		<Pin size={14} strokeWidth={1.75} class="shrink-0 text-primary" aria-label="Pinned" />
	{/if}
	{#if post.locked}
		<Lock size={14} strokeWidth={1.75} class="shrink-0 text-text-subtle" aria-label="Locked" />
	{/if}
{/snippet}

{#snippet meta()}
	<AuthorName
		name={post.imported_author?.name ?? authorName(serverId, post.author_id)}
		imported={post.imported_author != null}
	/>
	<span aria-hidden="true">·</span>
	<span class="flex shrink-0 items-center gap-1">
		<MessageSquare size={12} strokeWidth={1.75} />
		{post.reply_count}
		<span class="sr-only">{post.reply_count === 1 ? 'reply' : 'replies'}</span>
	</span>
	<span aria-hidden="true">·</span>
	<span class="shrink-0">{timeAgo(post.last_activity_at)}</span>
{/snippet}

{#if layout === 'gallery'}
	<a
		{...rest}
		{href}
		class="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		<ForumThumbnail thumbnail={post.thumbnail} class="aspect-video w-full" />
		<div class="flex min-w-0 flex-1 flex-col gap-2 p-3">
			<div class="flex items-start gap-1.5">
				<h3 class="line-clamp-2 min-w-0 flex-1 text-sm font-semibold break-words">{post.title}</h3>
				{@render badges()}
			</div>
			{#if postTags.length > 0}
				<div class="flex flex-wrap gap-1">
					{#each postTags as tag (tag.id)}
						<ForumTagChip {tag} />
					{/each}
				</div>
			{/if}
			<div class="mt-auto flex items-center gap-1.5 pt-1 text-xs text-text-subtle">
				{@render meta()}
			</div>
		</div>
	</a>
{:else}
	<a
		{...rest}
		{href}
		class="flex min-w-0 items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		<div class="flex min-w-0 flex-1 flex-col gap-1.5">
			<div class="flex items-center gap-1.5">
				<h3
					class="truncate text-sm font-semibold max-md:line-clamp-2 max-md:break-words max-md:whitespace-normal"
				>
					{post.title}
				</h3>
				{@render badges()}
			</div>
			<div class="flex min-w-0 items-center gap-1.5 text-xs text-text-subtle">
				{@render meta()}
			</div>
			{#if postTags.length > 0}
				<div class="flex flex-wrap gap-1 sm:hidden">
					{#each postTags as tag (tag.id)}
						<ForumTagChip {tag} />
					{/each}
				</div>
			{/if}
		</div>
		{#if postTags.length > 0}
			<div class="hidden max-w-[40%] flex-wrap justify-end gap-1 sm:flex">
				{#each postTags as tag (tag.id)}
					<ForumTagChip {tag} />
				{/each}
			</div>
		{/if}
	</a>
{/if}
