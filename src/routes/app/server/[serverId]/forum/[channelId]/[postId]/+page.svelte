<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import ChannelHeader from '$lib/components/ui/message/ChannelHeader.svelte';
	import MessageList from '$lib/components/ui/message/MessageList.svelte';
	import Composer from '$lib/components/ui/message/Composer.svelte';
	import TypingIndicator from '$lib/components/ui/message/TypingIndicator.svelte';
	import UsersSidebar from '$lib/components/ui/sidebar/UsersSidebar.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import ActionDropdownItems from '$lib/components/ui/dropdown-menu/ActionDropdownItems.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
	import ForumTagChip from '$lib/components/forum/ForumTagChip.svelte';
	import { membersPanelState } from '$lib/states/membersPanelState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { forumState } from '$lib/states/forumState.svelte';
	import { postThreadKey } from '$lib/states/messagesState.svelte';
	import { typingState } from '$lib/states/typingState.svelte';
	import { Permission } from '$lib/permissions';
	import { getChannelMessages } from '$lib/requests/channels/getChannelMessages';
	import { normalizeError } from '$lib/requests/errors';
	import type { MessageTarget } from '$lib/types/messages.types';
	import { db } from '$lib/utils/db';
	import { channelPath } from '$lib/utils/channelRoutes';
	import { postActions } from '$lib/utils/menuActions';
	import { tagsOf } from '$lib/utils/forum';
	import { trackForumRead } from '$lib/utils/forumReading.svelte';
	import { ArrowLeft, Ellipsis, Lock, MessagesSquare, Pin } from 'lucide-svelte';

	const channelId = $derived(page.params.channelId ? parseInt(page.params.channelId) : null);
	const serverId = $derived(page.params.serverId ? parseInt(page.params.serverId) : null);
	const postId = $derived(page.params.postId ? parseInt(page.params.postId) : null);
	const channel = $derived(
		channelId != null ? (serversState.selectedServerChannels[channelId] ?? null) : null
	);
	const channelsLoaded = $derived(serversState.selectedServerChannelsLoaded);
	const isForum = $derived(channel?.type === 'forum');

	const post = $derived(postId != null ? forumState.post(postId) : undefined);
	const tags = $derived(channelId != null ? forumState.tags(channelId) : []);
	const postTags = $derived(post ? tagsOf(post, tags) : []);
	const target = $derived<MessageTarget | null>(
		serverId != null && channelId != null && postId != null
			? { kind: 'channel', serverId, channelId, postId }
			: null
	);
	const indexHref = $derived(
		serverId != null && channelId != null ? `/app/server/${serverId}/forum/${channelId}/` : '/app/'
	);
	const canModerate = $derived(serversState.can(Permission.MANAGE_MESSAGES));
	const locked = $derived(post?.locked === true && !canModerate);
	const actions = $derived(serverId != null && post ? postActions(serverId, post) : []);

	let status = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let shownId: number | null = null;

	$effect(() => {
		const id = channelId;
		untrack(() => serversState.setSelectedChannelId(id));
	});

	$effect(() => {
		if (!channel || isForum || serverId == null) return;
		const path = channelPath(serverId, channel);
		untrack(() => goto(path, { replaceState: true }));
	});

	trackForumRead(() => (isForum ? channelId : null));

	async function load(forumId: number, id: number) {
		status = forumState.post(id) ? 'ready' : 'loading';
		void forumState.loadTags(forumId);
		try {
			await forumState.loadPost(forumId, id);
			if (postId === id) status = 'ready';
		} catch (e) {
			if (postId !== id) return;
			if (normalizeError(e).status === 404) status = 'missing';
			else if (!forumState.post(id)) status = 'error';
		}
	}

	$effect(() => {
		if (!isForum || channelId == null || postId == null) return;
		const forumId = channelId;
		const id = postId;
		untrack(() => load(forumId, id));
	});

	// A post that was there and is gone was deleted, by someone else or by us.
	$effect(() => {
		if (postId == null) return;
		if (post) {
			shownId = postId;
			return;
		}
		if (shownId !== postId) return;
		shownId = null;
		toast('This post was deleted');
		untrack(() => goto(indexHref, { replaceState: true }));
	});
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
		{:else if isForum}
			<div
				class="flex shrink-0 items-start gap-3 border-b border-border px-6 py-3 max-md:gap-2 max-md:px-3"
			>
				<a
					href={indexHref}
					aria-label="Back to posts"
					class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11"
				>
					<ArrowLeft size={18} strokeWidth={1.75} />
				</a>
				<div class="flex min-w-0 flex-1 flex-col gap-1.5">
					<div class="flex items-center gap-2">
						<h2 class="min-w-0 text-lg font-semibold break-words">{post?.title ?? '…'}</h2>
						{#if post?.pinned}
							<Pin size={16} strokeWidth={1.75} class="shrink-0 text-primary" aria-label="Pinned" />
						{/if}
						{#if post?.locked}
							<Lock
								size={16}
								strokeWidth={1.75}
								class="shrink-0 text-text-subtle"
								aria-label="Locked"
							/>
						{/if}
					</div>
					{#if postTags.length > 0}
						<div class="flex flex-wrap gap-1">
							{#each postTags as tag (tag.id)}
								<ForumTagChip {tag} />
							{/each}
						</div>
					{/if}
				</div>
				{#if actions.length > 0}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							aria-label="Post actions"
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11"
						>
							<Ellipsis size={18} strokeWidth={1.75} />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-56">
							<ActionDropdownItems {actions} />
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
			</div>

			{#if status === 'missing'}
				<div class="m-auto">
					<EmptyState title="Post not found" description="It may have been deleted.">
						{#snippet icon()}
							<MessagesSquare size={20} strokeWidth={1.75} />
						{/snippet}
						{#snippet action()}
							<a
								href={indexHref}
								class="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
							>
								Back to posts
							</a>
						{/snippet}
					</EmptyState>
				</div>
			{:else if status === 'error'}
				<div class="m-auto">
					<ErrorState
						title="Couldn’t load this post"
						onRetry={() => channelId != null && postId != null && load(channelId, postId)}
					/>
				</div>
			{:else if status === 'ready' && channelId != null && postId != null}
				<MessageList
					threadKey={postThreadKey(postId)}
					{target}
					trackRead={false}
					fetchPage={(before) => getChannelMessages(channelId, before, 50, postId)}
					readCache={() => db.messages.where({ post_id: postId }).sortBy('timestamp')}
					emptyDescription="Nothing here yet."
					errorDescription="There was a problem reading this post."
					onNotFound={() => (status = 'missing')}
				/>

				<TypingIndicator names={typingState.names(postThreadKey(postId))} />
				{#if locked}
					<div class="px-8 pb-6 max-md:px-3 max-md:pb-[max(12px,var(--safe-bottom))]">
						<div
							class="flex items-center gap-2 rounded-xl border border-input bg-surface-input px-4 py-3.5 text-sm text-text-subtle"
						>
							<Lock size={16} strokeWidth={1.75} class="shrink-0" />
							This post is locked. Only moderators can reply.
						</div>
					</div>
				{:else}
					<Composer {target} placeholder="Reply to this post…" />
				{/if}
			{/if}
		{/if}
	</div>

	{#if membersPanelState.open}
		<UsersSidebar />
	{/if}
</div>
