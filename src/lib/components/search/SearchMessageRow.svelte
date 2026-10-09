<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import AuthorName from '$lib/components/ui/message/AuthorName.svelte';
	import { conversationsState } from '$lib/states/conversationsState.svelte';
	import { forumState } from '$lib/states/forumState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import type { User } from '$lib/types/auth.types';
	import type { StoredMessage } from '$lib/types/localHistory.types';
	import { db } from '$lib/utils/db';
	import { searchableText, snippet } from '$lib/utils/messageSearch';
	import SearchHighlight from './SearchHighlight.svelte';

	let {
		message,
		tokens,
		active,
		id,
		onOpen,
		onHover
	}: {
		message: StoredMessage;
		tokens: string[];
		active: boolean;
		id: string;
		onOpen: () => void;
		onHover: () => void;
	} = $props();

	const imported = $derived(message.imported_author ?? null);
	let fetchedUser = $state<User | null>(null);
	const user = $derived(imported ? null : (usersState.users[message.user_id] ?? fetchedUser));

	$effect(() => {
		if (imported || usersState.users[message.user_id]) return;
		let cancelled = false;
		Promise.resolve(usersState.getOrFetchUser(message.user_id))
			.then((u) => {
				if (!cancelled) fetchedUser = u;
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	let storedPostTitle = $state<string | null>(null);
	const postTitle = $derived(
		message.post_id != null ? (forumState.post(message.post_id)?.title ?? storedPostTitle) : null
	);

	$effect(() => {
		const postId = message.post_id;
		if (postId == null || forumState.post(postId)) return;
		let cancelled = false;
		db.posts
			.get(postId)
			.then((post) => {
				if (!cancelled) storedPostTitle = post?.title ?? null;
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	const place = $derived.by(() => {
		if (message.conversation_id != null) {
			const partner = conversationsState.conversations[message.conversation_id]?.other_user;
			const name = partner ? (usersState.users[partner.id] ?? partner).username : '…';
			return `Direct message with ${name}`;
		}
		const channel = `#${unreadState.channelName(message.channel_id ?? -1)}`;
		if (message.post_id != null) return `${postTitle ?? 'Post'} · ${channel}`;
		const server = message.server_id != null ? serversState.servers[message.server_id]?.name : null;
		return server ? `${channel} · ${server}` : channel;
	});

	const sent = $derived.by(() => {
		const date = new Date(message.timestamp);
		const sameYear = date.getFullYear() === new Date().getFullYear();
		return date.toLocaleString([], {
			month: 'short',
			day: 'numeric',
			year: sameYear ? undefined : 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	});

	const parts = $derived(snippet(searchableText(message), tokens));
</script>

<button
	{id}
	type="button"
	role="option"
	aria-selected={active}
	tabindex="-1"
	onclick={onOpen}
	onmousemove={onHover}
	class="flex w-full gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none {active
		? 'bg-border'
		: ''}"
>
	<span aria-hidden="true" class="mt-0.5 shrink-0">
		<Avatar {user} name={imported?.name} size="md" rounded="rounded-[10px]" className="h-8 w-8" />
	</span>
	<span class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span class="flex items-baseline gap-2">
			<span class="flex min-w-0 shrink-0 items-center gap-1.5 text-sm font-semibold">
				<AuthorName name={imported?.name ?? user?.username ?? '…'} imported={imported != null} />
			</span>
			<span class="min-w-0 truncate text-xs text-text-subtle">{place}</span>
			<span class="ml-auto shrink-0 font-mono text-[11px] whitespace-nowrap text-text-subtle">
				{sent}
			</span>
		</span>
		<span class="line-clamp-2 text-sm break-words text-text-body">
			<SearchHighlight {parts} />
		</span>
	</span>
</button>
