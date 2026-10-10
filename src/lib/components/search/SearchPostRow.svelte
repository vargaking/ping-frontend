<script lang="ts">
	import { MessagesSquare } from 'lucide-svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import type { StoredPost } from '$lib/types/localHistory.types';
	import { markWords } from '$lib/utils/messageSearch';
	import SearchHighlight from './SearchHighlight.svelte';

	let {
		post,
		tokens,
		active,
		id,
		onOpen,
		onHover
	}: {
		post: StoredPost;
		tokens: string[];
		active: boolean;
		id: string;
		onOpen: () => void;
		onHover: () => void;
	} = $props();

	const place = $derived(
		[`#${unreadState.channelName(post.channel_id)}`, serversState.servers[post.server_id]?.name]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<button
	{id}
	type="button"
	role="option"
	aria-selected={active}
	tabindex="-1"
	onclick={onOpen}
	onmousemove={onHover}
	class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none {active
		? 'bg-border'
		: ''}"
>
	<span
		aria-hidden="true"
		class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-input text-muted-foreground"
	>
		<MessagesSquare size={16} strokeWidth={1.75} />
	</span>
	<span class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span class="truncate text-sm font-semibold">
			<SearchHighlight parts={markWords(post.title, tokens)} />
		</span>
		<span class="truncate text-xs text-text-subtle">{place}</span>
	</span>
</button>
