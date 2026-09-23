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
	import { getChannelMessages } from '$lib/requests/channels/getChannelMessages';
	import { db } from '$lib/utils/db';
	import { tick, untrack } from 'svelte';
	import { MessagesSquare } from 'lucide-svelte';

	let messageWrapper = $state<HTMLDivElement>();
	let topSentinel = $state<HTMLDivElement>();
	let membersOpen = $state(true);
	let loadState = $state<'loading' | 'error' | 'ready'>('loading');

	// Cursor for the next older page, and a guard so overlapping scrolls don't
	// fire two history loads at once.
	let nextCursor = $state<string | null>(null);
	let loadingOlder = $state(false);

	// Id of the newest message we've already scrolled to, so a live message at
	// the bottom pins the view but prepending older history never does.
	let autoScrollAnchorId = $state<string | null>(null);

	// Whether the viewport is parked at the bottom. Tracked from real scroll
	// events (not measured the instant a message lands) so reading older history
	// is never yanked back down when a new message arrives.
	let stickToBottom = true;

	function handleScroll() {
		const el = messageWrapper;
		if (el) stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
	}

	const currentChannelId = $derived(page.params.channelId ? parseInt(page.params.channelId) : null);

	// Timestamp (ms) of the last message seen on the previous visit to this
	// channel, and the id of the first message past it. The divider is pinned to
	// that message once on open, so messages sent or received while we're looking
	// never move it or spawn a second one.
	let unreadBoundary = $state<number | null>(null);
	let unreadAnchorId = $state<string | null>(null);

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

		for (const m of messagesState.messages(currentChannelId ?? -1)) {
			const day = dayKey(m.timestamp);
			if (day !== lastDay) {
				flush();
				result.push({ kind: 'date', key: `d-${day}`, label: dayLabel(m.timestamp) });
				lastDay = day;
			}

			if (!unreadInserted && unreadAnchorId != null && m.id === unreadAnchorId) {
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

	// Bumped on every switch so a slow read for a channel we've already left
	// can't overwrite the one we're now looking at.
	let loadToken = 0;

	function applyPage(channelId: number, messages: MessageType[], hasMore: boolean) {
		messagesState.set(channelId, messages, hasMore);
		autoScrollAnchorId = messages.at(-1)?.id ?? null;
		stickToBottom = true;

		// Pin the unread divider to the first message past the boundary, once.
		const boundary = unreadBoundary;
		unreadAnchorId =
			boundary != null
				? (messages.find((m) => new Date(m.timestamp).getTime() > boundary)?.id ?? null)
				: null;

		loadState = 'ready';
		const latest = messages.at(-1)?.timestamp;
		if (latest) localStorage.setItem(`read:${channelId}`, latest);
		tick().then(() => setTimeout(scrollToBottom, 100));
	}

	async function loadMessages(channelId: number) {
		const token = ++loadToken;
		nextCursor = null;

		// Only flash the skeleton on a first visit, when there's nothing cached
		// for this channel yet. Revisits keep their per-channel messages on
		// screen while we refresh, so the switch doesn't flicker.
		if (messagesState.messages(channelId).length === 0) loadState = 'loading';

		// Everything newer than the previous visit renders under "New".
		const prevRead = localStorage.getItem(`read:${channelId}`);
		unreadBoundary = prevRead ? Date.parse(prevRead) : null;

		try {
			// The API is the source of truth for the newest page; Dexie is a cache.
			const pageData = await getChannelMessages(channelId);
			if (token !== loadToken) return; // a newer switch superseded us

			const ascending = [...pageData.messages].reverse();
			nextCursor = pageData.next_cursor;
			applyPage(channelId, ascending, pageData.has_more);
			db.messages.bulkPut(ascending).catch((e) => console.warn('Failed to cache messages', e));
		} catch (e) {
			if (token !== loadToken) return;
			console.warn('Failed to load messages from API, falling back to cache', e);
			try {
				const cached = await db.messages
					.where({ server_id: serversState.selectedServer?.id, channel_id: channelId })
					.sortBy('timestamp');
				if (token !== loadToken) return;
				nextCursor = null;
				applyPage(channelId, cached, false);
			} catch (cacheError) {
				if (token !== loadToken) return;
				console.error('Failed to load messages', cacheError);
				if (messagesState.messages(channelId).length === 0) loadState = 'error';
			}
		}
	}

	async function loadOlder() {
		const channelId = currentChannelId;
		if (channelId == null || loadingOlder) return;
		if (!messagesState.hasMore(channelId) || !nextCursor) return;

		const el = messageWrapper;
		// The top sentinel stays permanently in view while the loaded history is
		// too short to overflow the viewport, which would otherwise make the
		// observer drain every page back-to-back the moment a channel opens. Only
		// auto-load older history once the list is actually scrollable and the
		// user has scrolled near the top — i.e. there's a real "scroll up" gesture.
		if (el) {
			const scrollable = el.scrollHeight - el.clientHeight;
			const OVERFLOW_SLACK = 4; // ignore sub-pixel rounding
			if (scrollable <= OVERFLOW_SLACK) return;
			if (el.scrollTop > 150) return;
		}

		loadingOlder = true;
		const prevHeight = el?.scrollHeight ?? 0;
		const prevTop = el?.scrollTop ?? 0;

		try {
			const pageData = await getChannelMessages(channelId, nextCursor);
			if (channelId !== currentChannelId) return;

			const olderAscending = [...pageData.messages].reverse();
			messagesState.prependOlder(channelId, olderAscending, pageData.has_more);
			nextCursor = pageData.next_cursor;
			db.messages
				.bulkPut(olderAscending)
				.catch((e) => console.warn('Failed to cache older messages', e));

			// Keep the viewport pinned to the same message: prepending taller
			// content on top would otherwise make the view jump.
			await tick();
			if (el) el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
		} catch (e) {
			console.error('Failed to load older messages', e);
		} finally {
			loadingOlder = false;
		}
	}

	// Reload only when the channel itself changes. loadMessages reads message
	// state, so without untrack this effect would re-fire on every send, receive
	// or older-page prepend — reloading the newest page and snapping to bottom.
	$effect(() => {
		const channelId = currentChannelId;
		if (channelId == null) return;
		untrack(() => {
			serversState.setSelectedChannelById(channelId);
			loadMessages(channelId);
		});
	});

	// Load older history when the top of the list scrolls into view.
	$effect(() => {
		const root = messageWrapper;
		const target = topSentinel;
		if (!root || !target) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) loadOlder();
			},
			{ root, rootMargin: '150px 0px 0px 0px' }
		);
		observer.observe(target);
		return () => observer.disconnect();
	});

	// Pin the view to the bottom when a new message lands there, but never when
	// older history is prepended (the newest id is unchanged in that case).
	$effect(() => {
		if (currentChannelId == null) return;
		const msgs = messagesState.messages(currentChannelId);
		const newestId = msgs.length ? msgs[msgs.length - 1].id : null;
		if (!newestId || newestId === autoScrollAnchorId) return;

		autoScrollAnchorId = newestId;
		if (stickToBottom) tick().then(scrollToBottom);
	});
</script>

<div class="flex h-full min-h-0">
	<div class="flex min-w-0 flex-1 flex-col">
		<ChannelHeader {membersOpen} onToggleMembers={() => (membersOpen = !membersOpen)} />

		<div bind:this={messageWrapper} onscroll={handleScroll} class="min-h-0 flex-1 overflow-y-auto">
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
					<div bind:this={topSentinel} aria-hidden="true"></div>
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
