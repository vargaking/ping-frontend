<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { tick, untrack } from 'svelte';
	import ChannelHeader from '$lib/components/ui/message/ChannelHeader.svelte';
	import UsersSidebar from '$lib/components/ui/sidebar/UsersSidebar.svelte';
	import ActionContextMenu from '$lib/components/ui/context-menu/ActionContextMenu.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import ForumPostItem from '$lib/components/forum/ForumPostItem.svelte';
	import ForumTagChip from '$lib/components/forum/ForumTagChip.svelte';
	import NewPostDialog from '$lib/components/forum/NewPostDialog.svelte';
	import { membersPanelState } from '$lib/states/membersPanelState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { forumState, type ForumSort } from '$lib/states/forumState.svelte';
	import { Permission } from '$lib/permissions';
	import { postActions } from '$lib/utils/menuActions';
	import { channelPath } from '$lib/utils/channelRoutes';
	import { trackForumRead } from '$lib/utils/forumReading.svelte';
	import { LayoutGrid, List, MessagesSquare, Plus, Search } from 'lucide-svelte';

	const channelId = $derived(page.params.channelId ? parseInt(page.params.channelId) : null);
	const serverId = $derived(page.params.serverId ? parseInt(page.params.serverId) : null);
	const channel = $derived(
		channelId != null ? (serversState.selectedServerChannels[channelId] ?? null) : null
	);
	const channelsLoaded = $derived(serversState.selectedServerChannelsLoaded);
	const isForum = $derived(channel?.type === 'forum');

	const index = $derived(channelId != null ? forumState.index(channelId) : undefined);
	const tags = $derived(channelId != null ? forumState.tags(channelId) : []);
	const posts = $derived(channelId != null ? forumState.visiblePosts(channelId) : []);
	const view = $derived(channelId != null ? forumState.view(channelId) : 'list');
	const canPost = $derived(
		serversState.canIn(Permission.SEND_MESSAGES, channelId, serversState.selectedServerId)
	);
	const filtering = $derived((index?.tagIds.length ?? 0) > 0 || index?.query.trim() !== '');

	let scroller = $state<HTMLDivElement>();
	let restoredFor: number | null = null;

	$effect(() => {
		const id = channelId;
		untrack(() => serversState.setSelectedChannelId(id));
	});

	$effect(() => {
		if (!channel || isForum || serverId == null) return;
		const path = channelPath(serverId, channel);
		untrack(() => goto(path, { replaceState: true }));
	});

	$effect(() => {
		if (!isForum || channelId == null) return;
		const id = channelId;
		void forumState.index(id)?.stale;
		untrack(() => forumState.open(id));
	});

	trackForumRead(() => (isForum ? channelId : null));

	// Coming back to the index finds it where it was left.
	$effect(() => {
		if (channelId == null || !scroller || index?.status !== 'ready' || restoredFor === channelId) {
			return;
		}
		const id = channelId;
		restoredFor = id;
		tick().then(() => {
			if (scroller) scroller.scrollTop = forumState.savedScroll(id);
		});
	});

	function handleScroll() {
		if (channelId != null && scroller && restoredFor === channelId) {
			forumState.saveScroll(channelId, scroller.scrollTop);
		}
	}

	function toggleTag(tagId: number) {
		if (channelId == null || !index) return;
		const next = index.tagIds.includes(tagId)
			? index.tagIds.filter((id) => id !== tagId)
			: [...index.tagIds, tagId];
		forumState.setTagIds(channelId, next);
		if (scroller) scroller.scrollTop = 0;
	}

	function newPost() {
		if (serverId != null && channelId != null) {
			overlayState.open(NewPostDialog, { serverId, channelId });
		}
	}

	const selectClass =
		'h-9 rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11';
	const toggleClass = (active: boolean) =>
		`flex h-9 w-9 items-center justify-center rounded-lg transition-colors pointer-coarse:h-11 pointer-coarse:w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
			active
				? 'bg-accent text-foreground'
				: 'text-muted-foreground hover:bg-accent hover:text-foreground'
		}`;
</script>

<div class="flex h-full min-h-0">
	<div class="flex min-w-0 flex-1 flex-col">
		<ChannelHeader />

		{#if !channel}
			{#if channelsLoaded}
				<div class="m-auto">
					<EmptyState title="Channel not found" description="It may have been deleted.">
						{#snippet icon()}
							<MessagesSquare size={20} strokeWidth={1.75} />
						{/snippet}
					</EmptyState>
				</div>
			{/if}
		{:else if isForum && channelId != null && serverId != null}
			<div class="flex shrink-0 flex-col gap-3 border-b border-border px-6 py-3 max-md:px-3">
				<div class="flex flex-wrap items-center gap-2">
					<div class="relative min-w-[180px] flex-1 sm:max-w-xs">
						<Search
							size={16}
							strokeWidth={1.75}
							class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
						/>
						<Input
							type="search"
							aria-label="Filter posts by title"
							placeholder="Filter by title"
							value={index?.query ?? ''}
							oninput={(e) => forumState.setQuery(channelId, e.currentTarget.value)}
							class="h-9 pl-9 pointer-coarse:h-11"
						/>
					</div>
					<select
						aria-label="Sort posts"
						value={index?.sort ?? 'activity'}
						onchange={(e) => forumState.setSort(channelId, e.currentTarget.value as ForumSort)}
						class={selectClass}
					>
						<option value="activity">Recent activity</option>
						<option value="newest">Newest</option>
					</select>
					<div class="flex items-center gap-0.5" role="group" aria-label="Layout">
						<button
							type="button"
							aria-label="List view"
							aria-pressed={view === 'list'}
							onclick={() => forumState.setView(channelId, 'list')}
							class={toggleClass(view === 'list')}
						>
							<List size={18} strokeWidth={1.75} />
						</button>
						<button
							type="button"
							aria-label="Gallery view"
							aria-pressed={view === 'gallery'}
							onclick={() => forumState.setView(channelId, 'gallery')}
							class={toggleClass(view === 'gallery')}
						>
							<LayoutGrid size={18} strokeWidth={1.75} />
						</button>
					</div>
					{#if canPost}
						<Button onclick={newPost} class="ml-auto">
							<Plus size={16} strokeWidth={1.75} />
							New post
						</Button>
					{/if}
				</div>
				{#if tags.length > 0}
					<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
						{#each tags as tag (tag.id)}
							<ForumTagChip
								{tag}
								selected={index?.tagIds.includes(tag.id) ?? false}
								onclick={() => toggleTag(tag.id)}
							/>
						{/each}
					</div>
				{/if}
			</div>

			<div
				bind:this={scroller}
				onscroll={handleScroll}
				class="min-h-0 flex-1 overflow-y-auto px-6 py-4 scrollbar-stable max-md:px-3"
			>
				{#if !index || index.status === 'loading'}
					<LoadingList rows={6} />
				{:else if index.status === 'error'}
					<div class="flex h-full items-center justify-center">
						<ErrorState
							title="Couldn’t load posts"
							description="There was a problem reading this forum."
							onRetry={() => forumState.reload(channelId)}
						/>
					</div>
				{:else if posts.length === 0 && !index.nextCursor}
					<div class="flex h-full items-center justify-center">
						<EmptyState
							title={filtering ? 'No posts match' : 'No posts yet'}
							description={filtering
								? 'Try removing a tag or changing the title filter.'
								: canPost
									? 'Start the first discussion.'
									: 'Posts will show up here.'}
						>
							{#snippet icon()}
								<MessagesSquare size={20} strokeWidth={1.75} />
							{/snippet}
							{#snippet action()}
								{#if canPost && !filtering}
									<Button onclick={newPost}>
										<Plus size={16} strokeWidth={1.75} />
										New post
									</Button>
								{/if}
							{/snippet}
						</EmptyState>
					</div>
				{:else}
					<ul
						aria-label="Posts"
						class={view === 'gallery'
							? 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4'
							: 'flex flex-col gap-0.5'}
					>
						{#each posts as post (post.id)}
							<li class="flex min-w-0 flex-col">
								<ActionContextMenu actions={postActions(serverId, post)}>
									{#snippet children(menuProps)}
										<ForumPostItem {...menuProps} {post} {serverId} {tags} layout={view} />
									{/snippet}
								</ActionContextMenu>
							</li>
						{/each}
					</ul>
					{#if index.nextCursor}
						<div class="mt-4 flex flex-col items-center gap-2">
							{#if index.query.trim() !== ''}
								<p class="text-xs text-text-subtle">The title filter only covers loaded posts.</p>
							{/if}
							<Button
								variant="secondary"
								disabled={index.loadingMore}
								onclick={() => forumState.loadMore(channelId)}
							>
								{index.loadingMore ? 'Loading…' : 'Load more'}
							</Button>
						</div>
					{:else if posts.length === 0}
						<p class="py-6 text-center text-sm text-text-subtle">No posts match the filter.</p>
					{/if}
				{/if}
			</div>
		{/if}
	</div>

	{#if membersPanelState.open}
		<UsersSidebar />
	{/if}
</div>
