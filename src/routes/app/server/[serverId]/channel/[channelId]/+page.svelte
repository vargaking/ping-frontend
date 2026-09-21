<script lang="ts">
	import { page } from '$app/state';
	import Composer from '$lib/components/ui/message/Composer.svelte';
	import ChannelHeader from '$lib/components/ui/message/ChannelHeader.svelte';
	import MessageGroup from '$lib/components/ui/message/MessageGroup.svelte';
	import DateDivider from '$lib/components/ui/message/DateDivider.svelte';
	import UnreadDivider from '$lib/components/ui/message/UnreadDivider.svelte';
	import TypingIndicator from '$lib/components/ui/message/TypingIndicator.svelte';
	import UsersSidebar from '$lib/components/ui/sidebar/UsersSidebar.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import type { MessageType } from '$lib/types/messages.types';
	import { messagesState } from '$lib/states/messagesState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { db } from '$lib/utils/db';
	import { tick } from 'svelte';
	import { MessagesSquare } from 'lucide-svelte';

	let messageWrapper = $state<HTMLDivElement>();
	let membersOpen = $state(true);
	let loadState = $state<'loading' | 'error' | 'ready'>('loading');

	const currentChannelId = $derived(page.params.channelId ? parseInt(page.params.channelId) : null);

	// Timestamp (ms) of the last message seen on the previous visit to this
	// channel — everything newer renders under the "New" divider.
	let unreadBoundary = $state<number | null>(null);

	const GROUP_GAP_MS = 5 * 60 * 1000;

	function dayKey(ts: string) {
		return new Date(ts).toDateString();
	}

	function dayLabel(ts: string) {
		const d = new Date(ts);
		const today = new Date();
		const yesterday = new Date();
		yesterday.setDate(today.getDate() - 1);
		if (d.toDateString() === today.toDateString()) return 'Today';
		if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
		return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
	}

	type RenderItem =
		| { kind: 'date'; key: string; label: string }
		| { kind: 'unread'; key: string }
		| { kind: 'group'; key: string; userId: number; messages: MessageType[] };

	const items = $derived.by<RenderItem[]>(() => {
		const result: RenderItem[] = [];
		let lastDay: string | null = null;
		let group: { userId: number; messages: MessageType[]; lastTs: string } | null = null;
		let unreadInserted = false;

		const flush = () => {
			if (group) {
				result.push({
					kind: 'group',
					key: `g-${group.messages[0].id}`,
					userId: group.userId,
					messages: group.messages
				});
				group = null;
			}
		};

		for (const m of messagesState.messages) {
			const day = dayKey(m.timestamp);
			if (day !== lastDay) {
				flush();
				result.push({ kind: 'date', key: `d-${day}`, label: dayLabel(m.timestamp) });
				lastDay = day;
			}

			if (
				!unreadInserted &&
				unreadBoundary != null &&
				new Date(m.timestamp).getTime() > unreadBoundary
			) {
				flush();
				result.push({ kind: 'unread', key: `u-${m.id}` });
				unreadInserted = true;
			}

			if (
				group &&
				group.userId === m.user_id &&
				new Date(m.timestamp).getTime() - new Date(group.lastTs).getTime() < GROUP_GAP_MS
			) {
				group.messages.push(m);
				group.lastTs = m.timestamp;
			} else {
				flush();
				group = { userId: m.user_id, messages: [m], lastTs: m.timestamp };
			}
		}
		flush();
		return result;
	});

	const scrollToBottom = () => {
		messageWrapper?.scrollTo({ top: messageWrapper.scrollHeight });
	};

	function loadMessages(channelId: number) {
		loadState = 'loading';
		messagesState.clear();

		// Capture the previous read marker, then advance it for next time.
		const readKey = `read:${channelId}`;
		const prevRead = localStorage.getItem(readKey);
		unreadBoundary = prevRead ? Date.parse(prevRead) : null;

		db.messages
			.where({ server_id: serversState.selectedServer?.id, channel_id: channelId })
			.sortBy('timestamp')
			.then((messages) => {
				messagesState.set(messages);
				loadState = 'ready';
				const latest = messages.at(-1)?.timestamp;
				if (latest) localStorage.setItem(readKey, latest);
				tick().then(() => setTimeout(scrollToBottom, 100));
			})
			.catch((e) => {
				console.error('Failed to load messages', e);
				loadState = 'error';
			});
	}

	$effect(() => {
		if (currentChannelId == null) return;
		serversState.setSelectedChannelById(currentChannelId);
		loadMessages(currentChannelId);
	});

	$effect(() => {
		if (messagesState.messages.length > 0) {
			tick().then(scrollToBottom);
		}
	});
</script>

<div class="flex h-full min-h-0">
	<div class="flex min-w-0 flex-1 flex-col">
		<ChannelHeader {membersOpen} onToggleMembers={() => (membersOpen = !membersOpen)} />

		<div bind:this={messageWrapper} class="min-h-0 flex-1 overflow-y-auto">
			{#if loadState === 'loading'}
				<div class="px-8 pt-6">
					<LoadingList rows={6} avatar />
				</div>
			{:else if loadState === 'error'}
				<div class="flex h-full items-center justify-center px-8">
					<ErrorState
						title="Couldn’t load messages"
						description="There was a problem reading this channel."
						onRetry={() => currentChannelId != null && loadMessages(currentChannelId)}
					/>
				</div>
			{:else if items.length === 0}
				<div class="flex h-full items-center justify-center px-8">
					<EmptyState
						title="No messages yet"
						description="Be the first to say something in this channel."
					>
						{#snippet icon()}
							<MessagesSquare size={20} strokeWidth={1.75} />
						{/snippet}
					</EmptyState>
				</div>
			{:else}
				<div class="flex flex-col gap-[18px] px-8 pt-6 pb-2">
					{#each items as item (item.key)}
						{#if item.kind === 'date'}
							<DateDivider label={item.label} />
						{:else if item.kind === 'unread'}
							<UnreadDivider />
						{:else}
							<MessageGroup userId={item.userId} messages={item.messages} />
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		<TypingIndicator names={[]} />
		<Composer />
	</div>

	{#if membersOpen}
		<UsersSidebar />
	{/if}
</div>
