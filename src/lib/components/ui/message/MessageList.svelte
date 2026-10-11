<script lang="ts">
	import MessageGroup from './MessageGroup.svelte';
	import { continuesGroup } from '$lib/utils/messageGroups';
	import DateDivider from './DateDivider.svelte';
	import UnreadDivider from './UnreadDivider.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import type { MessageTarget, MessageType } from '$lib/types/messages.types';
	import type { MessagePage, PageQuery } from '$lib/requests/channels/getChannelMessages';
	import { messagesState } from '$lib/states/messagesState.svelte';
	import { normalizeError } from '$lib/requests/errors';
	import { db } from '$lib/utils/db';
	import { onDestroy, tick, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { ArrowDown, MessagesSquare } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { usersState } from '$lib/states/usersState.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import { conversationsState } from '$lib/states/conversationsState.svelte';
	import { replyState } from '$lib/states/replyState.svelte';
	import { messageEditState } from '$lib/states/messageEditState.svelte';
	import { phoneState } from '$lib/states/phoneState.svelte';
	import { documentFocusState } from '$lib/utils/documentFocus.svelte';
	import { resyncState } from '$lib/states/resyncState.svelte';
	import { mergeNewestPage, replaceWithNewestPage } from '$lib/utils/mergeNewestPage';
	import { pruneToPage, readNewest, type CachedThread } from '$lib/utils/threadCache';
	import {
		countHeldBack,
		countNewBelow,
		escapeJumpsToLatest,
		isAtBottom,
		isFarFromBottom,
		jumpBehavior,
		jumpLabel,
		messagesBelow,
		showJumpButton,
		type SeenMarker
	} from '$lib/utils/jumpToLatest';
	import { hasEscapeLayer, isEditable } from '$lib/utils/openLayer';
	import {
		NEAR_BOTTOM_PX,
		NEAR_TOP_PX,
		NewerHistory,
		OlderHistory
	} from '$lib/utils/olderHistory.svelte';
	import {
		fetchOpeningPage,
		JUMP_FAILURE_TOAST,
		jumpFailure,
		type JumpFailure
	} from '$lib/utils/historyWindow';

	type Props = {
		/** messagesState key of the thread shown (see threadKey). */
		threadKey: string;
		/** Channel or DM this list belongs to — drives read-state tracking. */
		target: MessageTarget | null;
		/** Newest-first page of history: the newest, or as `query` says (older, around a message, newer). */
		fetchPage: (query?: PageQuery) => Promise<MessagePage>;
		/** The thread's local copy: shown first on a first open, kept in line with the newest page. */
		cache: CachedThread;
		emptyDescription: string;
		errorDescription: string;
		/** Shown above the first message once all older history is loaded, e.g. "Beginning of #general". */
		beginningLabel: string;
		/** When set, a 404 calls this instead of falling back to the cache. */
		onNotFound?: () => void;
		/** False when something else marks the thread read (a forum post is read with its channel). */
		trackRead?: boolean;
		/** A message to scroll to once the thread has loaded, e.g. from a search result. */
		jumpTo?: string | null;
		/** Called when the jump for `jumpTo` is over, whether or not the message was found. */
		onJumped?: () => void;
	};

	let {
		threadKey,
		target,
		fetchPage,
		cache,
		emptyDescription,
		errorDescription,
		beginningLabel,
		onNotFound,
		trackRead = true,
		jumpTo = null,
		onJumped
	}: Props = $props();

	let messageWrapper = $state<HTMLDivElement>();
	let topSentinel = $state<HTMLDivElement>();
	let bottomSentinel = $state<HTMLDivElement>();
	let loadState = $state<'reading' | 'loading' | 'error' | 'ready'>('loading');
	// The thread whose newest page is on screen; loadState alone stays 'ready' across a switch.
	let loadedKey = $state<string | null>(null);
	// The jump (thread and message) already carried out, so each value jumps once.
	let jumpDone: string | null = null;

	// Cursor for the next older page.
	let nextCursor = $state<string | null>(null);

	// Id of the newest message we've already scrolled to, so a live message at
	// the bottom pins the view but prepending older history never does.
	let autoScrollAnchorId = $state<string | null>(null);

	// Whether the viewport is parked at the bottom. Tracked from real scroll
	// events (not measured the instant a message lands) so reading older history
	// is never yanked back down when a new message arrives.
	let stickToBottom = $state(true);

	// More than a screen above the bottom (the button's threshold, apart from stickToBottom's).
	let farFromBottom = $state(false);

	// The newest message on screen the last time the view was at the bottom; what comes after counts as new.
	let seenThrough = $state<SeenMarker | null>(null);

	// A smooth jump is under way: its intermediate scroll events say nothing about where the user wants to be.
	let smoothJumping = false;
	let smoothJumpTimer: ReturnType<typeof setTimeout> | null = null;
	const SMOOTH_JUMP_SETTLE_MS = 1000;

	// True from the moment a thread's newest page renders until its first scroll to the bottom has
	// settled. The list is at the top until then, which must not read as a request for history.
	let opening = false;
	let openingTimer: ReturnType<typeof setTimeout> | null = null;

	// Set once the component is torn down; whatever was still in flight must then do nothing.
	let destroyed = false;

	// The list shows the IndexedDB cache because the API failed.
	let fromCache = $state(false);
	// Ids shown from IndexedDB while the newest page is still on its way.
	let cachedTail = $state.raw<ReadonlySet<string> | null>(null);
	// The newest page requested over a cached tail; a resync waits for it instead of racing it.
	let pendingOpen: Promise<void> | null = null;
	// How long a first open waits for IndexedDB before showing the skeleton instead.
	const CACHE_WAIT_MS = 300;
	// Older pages may hold edits or deletes we missed; they are dropped once back at the bottom.
	let staleOlder = false;

	// Height of the scroller as last observed. A scroll while it differs comes from a resize
	// (the keyboard opening), which says nothing about where the user wants to be.
	let viewHeight = 0;

	function handleScroll() {
		const el = messageWrapper;
		if (!el) return;
		if (smoothJumping && !isAtBottom(el)) return;
		stopSmoothJump();
		void older.request();
		void newer.request();
		measureScroll(el);
	}

	function measureScroll(el: HTMLElement) {
		farFromBottom = isFarFromBottom(el);
		if (el.clientHeight !== viewHeight) return;
		stickToBottom = isAtBottom(el) && !messagesState.newerExists(threadKey);
		if (stickToBottom && staleOlder && !resyncing) void resync();
	}

	function startSmoothJump() {
		smoothJumping = true;
		if (smoothJumpTimer) clearTimeout(smoothJumpTimer);
		smoothJumpTimer = setTimeout(endSmoothJump, SMOOTH_JUMP_SETTLE_MS);
	}

	function stopSmoothJump() {
		smoothJumping = false;
		if (smoothJumpTimer) clearTimeout(smoothJumpTimer);
		smoothJumpTimer = null;
	}

	function endSmoothJump() {
		stopSmoothJump();
		handleScroll();
	}

	// Id of the last message read before this open (from unreadState/conversationsState,
	// snapshotted before we mark the thread read), and the id of the first loaded
	// message past it. The divider is pinned to that message once on open, so
	// messages sent or received while we're looking never move it or spawn a second one.
	let unreadBoundaryId = $state<string | null>(null);
	let unreadAnchorId = $state<string | null>(null);

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
		| { kind: 'group'; key: string; messages: MessageType[] };

	const items = $derived.by<RenderItem[]>(() => {
		const result: RenderItem[] = [];
		let lastDay: string | null = null;
		let group: MessageType[] | null = null;
		let unreadInserted = false;

		const flush = () => {
			if (group) {
				result.push({
					kind: 'group',
					key: `g-${group[0].id}`,
					messages: group
				});
				group = null;
			}
		};

		for (const m of messagesState.messages(threadKey)) {
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

			if (group && continuesGroup(group[group.length - 1], m)) {
				group.push(m);
			} else {
				flush();
				group = [m];
			}
		}
		flush();
		return result;
	});

	const scrollToBottom = () => {
		messageWrapper?.scrollTo({ top: messageWrapper.scrollHeight });
	};

	// Bumped on every switch so a slow read for a thread we've already left
	// can't overwrite the one we're now looking at.
	let loadToken = 0;

	// --- mark read (replaces the old localStorage `read:<key>` marker) ---

	type ReadMarkers = { lastReadId: string | null; lastMessageId: string | null };

	/** Current read markers for `target`, read from the single source of truth. */
	function readSnapshot(): ReadMarkers | null {
		if (!target || !trackRead) return null;
		if (target.kind === 'channel') {
			return {
				lastReadId: unreadState.channelLastReadId(target.channelId),
				lastMessageId: unreadState.channelLastMessageId(target.channelId)
			};
		}
		const conversation = conversationsState.conversations[target.conversationId];
		return {
			lastReadId: conversation?.last_read_message_id ?? null,
			lastMessageId: conversation?.last_message_id ?? null
		};
	}

	/** The message a jump to still has to reveal in this thread, if any. */
	function pendingJump(key: string): string | null {
		return jumpTo && jumpDone !== `${key}:${jumpTo}` ? jumpTo : null;
	}

	type PageOptions = {
		hasMore: boolean;
		/** The page is a window: newer messages exist beyond it. */
		hasNewer?: boolean;
		/** The view is about to be moved to a message, not the bottom. */
		focus?: boolean;
		/** With `hasNewer`: messages of a live thread the user hadn't seen, now past the window. */
		unseen?: MessageType[];
	};

	// Pin the unread divider to the message right after the boundary, once. If
	// the boundary is older than this page, anchor on the first loaded message.
	// A thread that was never read (no marker) gets no divider.
	function anchorUnreadDivider(messages: MessageType[], hasNewer: boolean) {
		const boundary = unreadBoundaryId;
		if (boundary != null) {
			const idx = messages.findIndex((m) => m.id === boundary);
			const first = hasNewer ? null : messages[0];
			unreadAnchorId = idx >= 0 ? (messages[idx + 1]?.id ?? null) : (first?.id ?? null);
		} else {
			unreadAnchorId = null;
		}
	}

	function applyPage(
		key: string,
		messages: MessageType[],
		{ hasMore, hasNewer = false, focus = false, unseen = [] }: PageOptions
	) {
		if (hasNewer) messagesState.setWindow(key, messages, hasMore, unseen);
		else messagesState.set(key, messages, hasMore);
		autoScrollAnchorId = messagesState.messages(key).at(-1)?.id ?? null;
		const target = pendingJump(key);
		stickToBottom = !(
			focus ||
			hasNewer ||
			(target != null && messages.some((m) => m.id === target))
		);
		farFromBottom = false;
		stopSmoothJump();
		const newest = messagesState.messages(key).at(-1);
		seenThrough = newest ? { id: newest.id, timestamp: newest.timestamp } : null;

		anchorUnreadDivider(messages, hasNewer);

		loadedKey = key;
		loadState = 'ready';
		opening = true;
		if (openingTimer) clearTimeout(openingTimer);
		tick().then(() => {
			if (destroyed) return;
			if (stickToBottom) scrollToBottom();
			openingTimer = setTimeout(() => {
				if (stickToBottom) scrollToBottom();
				opening = false;
				void older.request();
				void newer.request();
			}, 100);
		});
	}

	async function loadMessages(key: string) {
		const token = ++loadToken;
		nextCursor = null;
		older.reset();
		newer.reset();
		messagesState.beginNewestLoad(key);
		cachedTail = null;

		// Only flash the skeleton on a first visit, when there's nothing cached
		// for this thread yet. Revisits keep their messages on screen while we
		// refresh, so the switch doesn't flicker.
		const firstOpen = messagesState.messages(key).length === 0;
		const jump = pendingJump(key);
		if (firstOpen) loadState = jump ? 'loading' : 'reading';

		// Snapshot the read markers BEFORE marking the thread read, so the divider
		// anchors on what was actually unread when we opened it.
		const snapshot = readSnapshot();
		unreadBoundaryId =
			snapshot && snapshot.lastMessageId != null && snapshot.lastMessageId !== snapshot.lastReadId
				? snapshot.lastReadId
				: null;

		if (firstOpen && !jump) {
			await showCachedTail(key, token);
			if (token !== loadToken) return;
		}

		const run = fetchNewest(key, token, jump);
		if (cachedTail) pendingOpen = run;
		await run.finally(() => {
			if (pendingOpen === run) pendingOpen = null;
		});
	}

	// The newest messages from IndexedDB, shown while the newest page is requested. They are read
	// before the request goes out, so a row the page lacks was already stored when it was built.
	async function showCachedTail(key: string, token: number) {
		const cached = await Promise.race([
			readNewest(cache),
			new Promise<null>((resolve) => setTimeout(resolve, CACHE_WAIT_MS, null))
		]);
		if (token !== loadToken) return;
		if (!cached?.length) {
			loadState = 'loading';
			return;
		}
		cachedTail = new Set(cached.map((m) => m.id));
		// Older history exists beyond a cached tail; the cursor to it comes with the page.
		applyPage(key, replaceWithNewestPage(messagesState.messages(key), cached, new Set()), {
			hasMore: true
		});
		unreadAnchorId = null; // the divider waits for the page
	}

	async function fetchNewest(key: string, token: number, jump: string | null) {
		const requested = new Set(messagesState.messages(key).map((m) => m.id));
		try {
			// The API is the source of truth for the newest page; Dexie is a cache.
			const pageData = await fetchOpeningPage(fetchPage, jump);
			if (token !== loadToken) return; // a newer switch superseded us

			const ascending = [...pageData.messages].reverse();
			db.messages.bulkPut(ascending).catch((e) => console.warn('Failed to cache messages', e));
			nextCursor = pageData.next_cursor;
			fromCache = false;
			staleOlder = false;
			if (cachedTail) {
				await landOverCachedTail(key, token, ascending, pageData.has_more, requested);
			} else {
				applyPage(key, ascending, {
					hasMore: pageData.has_more,
					hasNewer: pageData.has_newer ?? false
				});
				if (jump == null && !pageData.has_newer) {
					dropGoneFromCache(key, ascending, pageData.has_more, requested);
				}
			}
		} catch (e) {
			if (token !== loadToken) return;
			if (onNotFound && normalizeError(e).status === 404) {
				cachedTail = null;
				messagesState.endNewestLoad(key);
				onNotFound();
				return;
			}
			console.warn('Failed to load messages from API, falling back to cache', e);
			if (cachedTail) {
				// Offline over a cached tail: keep it, and don't move the view.
				cachedTail = null;
				fromCache = true;
				messagesState.endNewestLoad(key);
				return;
			}
			const cached = await readNewest(cache);
			if (token !== loadToken) return;
			if (cached) {
				nextCursor = null;
				fromCache = true;
				applyPage(key, cached, { hasMore: false });
				return;
			}
			console.error('Failed to load messages from the local cache');
			messagesState.endNewestLoad(key);
			if (messagesState.messages(key).length === 0) loadState = 'error';
		}
	}

	// Lands the newest page over the cached tail the way a resync does, so a reader who
	// scrolled up while it loaded stays where they are.
	async function landOverCachedTail(
		key: string,
		token: number,
		page: MessageType[],
		hasMore: boolean,
		requested: ReadonlySet<string>
	) {
		const shown = cachedTail!;
		cachedTail = null;
		const merged = replaceWithNewestPage(messagesState.messages(key), page, requested);
		// Without a shared message the page may leave a gap, so it can't vouch for what is stored.
		if (!page.some((m) => shown.has(m.id))) {
			applyPage(key, merged, { hasMore });
			return;
		}

		const anchors = stickToBottom ? null : visibleRows();
		messagesState.replace(key, merged, hasMore);
		anchorUnreadDivider(merged, false);
		dropGoneFromCache(key, page, hasMore, requested);
		await tick();
		if (destroyed || token !== loadToken) return;
		if (anchors) keepRowsInPlace(anchors);
		else scrollToBottom();
		void older.request();
	}

	function dropGoneFromCache(
		key: string,
		page: MessageType[],
		hasMore: boolean,
		requested: ReadonlySet<string>
	) {
		pruneToPage(cache, {
			page,
			complete: !hasMore,
			requested,
			keep: () => new Set(messagesState.messages(key).map((m) => m.id))
		}).catch((e) => console.warn('Failed to drop deleted messages from the cache', e));
	}

	// Pins the view to the same messages across a change at the top of the list, such as a page
	// arriving or placeholder rows appearing or going away. At the bottom it stays at the bottom.
	// It sets an absolute offset, so it gives the same result with or without the browser's own
	// scroll anchoring. With `revealTop`, a view parked at the very top stays there so rows added
	// above the messages are seen rather than pushed out of view.
	async function keepView(change: () => void, { revealTop = false } = {}) {
		const el = messageWrapper;
		const prevHeight = el?.scrollHeight ?? 0;
		const prevTop = el?.scrollTop ?? 0;
		change();
		await tick();
		if (!el || destroyed) return;
		if (revealTop && prevTop <= 1) el.scrollTop = prevTop;
		else if (stickToBottom) scrollToBottom();
		else el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
	}

	const older: OlderHistory<MessagePage> = new OlderHistory({
		metrics: () => messageWrapper ?? null,
		available: () =>
			!destroyed &&
			!opening &&
			!newer.loading &&
			loadedKey === threadKey &&
			messagesState.hasMore(threadKey) &&
			nextCursor != null,
		fetch: () => fetchPage({ before: nextCursor }),
		apply(pageData) {
			const olderAscending = [...pageData.messages].reverse();
			const before = messagesState.messages(threadKey).length;
			messagesState.prependOlder(threadKey, olderAscending, pageData.has_more);
			nextCursor = pageData.next_cursor;
			db.messages
				.bulkPut(olderAscending)
				.catch((e) => console.warn('Failed to cache older messages', e));
			return messagesState.messages(threadKey).length - before;
		},
		keepView
	});

	// Pins the view across a page added below the messages, which must not move what is on screen.
	async function keepViewBelow(change: () => void) {
		const el = messageWrapper;
		const prevTop = el?.scrollTop ?? 0;
		change();
		await tick();
		if (!el || destroyed) return;
		el.scrollTop = prevTop;
		measureScroll(el);
	}

	// Loads the messages after a window's newest one while the user is at its bottom.
	const newer: NewerHistory<MessagePage> = new NewerHistory({
		metrics: () => messageWrapper ?? null,
		available: () =>
			!destroyed &&
			!opening &&
			!fromCache &&
			!older.loading &&
			loadedKey === threadKey &&
			messagesState.newerAnchor(threadKey) != null,
		async fetch() {
			const key = threadKey;
			const token = loadToken;
			messagesState.beginNewestLoad(key);
			try {
				return await fetchPage({ after: messagesState.newerAnchor(key)! });
			} catch (e) {
				if (token === loadToken && !pendingWindow) messagesState.endNewestLoad(key);
				throw e;
			}
		},
		apply(pageData) {
			const newerAscending = [...pageData.messages].reverse();
			const added = messagesState.appendNewer(
				threadKey,
				newerAscending,
				pageData.has_newer ?? false
			);
			if (!messagesState.newerExists(threadKey)) {
				const newest = messagesState.messages(threadKey).at(-1);
				seenThrough = newest ? { id: newest.id, timestamp: newest.timestamp } : null;
			}
			db.messages
				.bulkPut(newerAscending)
				.catch((e) => console.warn('Failed to cache newer messages', e));
			return added;
		},
		keepView: keepViewBelow
	});

	onDestroy(() => {
		destroyed = true;
		loadToken++;
		older.reset();
		newer.reset();
		if (openingTimer) clearTimeout(openingTimer);
		openingTimer = null;
		stopSmoothJump();
	});

	let resyncing: Promise<void> | null = null;

	function resync(): Promise<void> {
		resyncing ??= resyncThread().finally(() => (resyncing = null));
		return resyncing;
	}

	/** Catch up on what may have been missed while the socket was down or the page frozen. */
	async function resyncThread() {
		const key = threadKey;
		do {
			await pendingOpen?.catch(() => {});
			await pendingWindow?.catch(() => {});
			await older.idle();
			await newer.idle();
		} while (pendingWindow || pendingOpen);
		if (destroyed || key !== threadKey) return;
		if (loadState !== 'ready' || fromCache) return loadMessages(key);

		const token = ++loadToken;
		const loaded = messagesState.messages(key);
		const knownBefore = new Set(loaded.map((m) => m.id));
		const newestBefore = loaded.findLast((m) => !m.status)?.id ?? null;

		let pageData: MessagePage;
		try {
			pageData = await fetchPage();
		} catch (e) {
			console.warn('Failed to resync messages', e);
			return;
		}
		if (token !== loadToken) return;

		const page = [...pageData.messages].reverse();
		db.messages.bulkPut(page).catch((e) => console.warn('Failed to cache messages', e));
		const current = messagesState.messages(key);

		if (stickToBottom) {
			messagesState.replace(
				key,
				replaceWithNewestPage(current, page, knownBefore),
				pageData.has_more
			);
			nextCursor = pageData.next_cursor;
			staleOlder = false;
			pinDividerAfter(newestBefore, page);
			dropGoneFromCache(key, page, pageData.has_more, knownBefore);
			tick().then(scrollToBottom);
			return;
		}

		staleOlder = pageData.has_more;
		const merged = mergeNewestPage(current, page, { complete: !pageData.has_more, knownBefore });
		if (!merged) {
			messagesState.markNewerExists(key);
			return;
		}

		const anchors = visibleRows();
		const hasMore = merged.keptOlder ? messagesState.hasMore(key) : pageData.has_more;
		if (!merged.keptOlder) nextCursor = pageData.next_cursor;
		messagesState.replace(key, merged.messages, hasMore);
		pinDividerAfter(newestBefore, page);
		dropGoneFromCache(key, page, pageData.has_more, knownBefore);
		await tick();
		keepRowsInPlace(anchors);
	}

	/** Mark the first message from someone else that arrived after `newestBefore` as unread,
	 *  unless the divider already sits on a loaded message. */
	function pinDividerAfter(newestBefore: string | null, page: MessageType[]) {
		if (!trackRead || newestBefore == null) return;
		const loaded = messagesState.messages(threadKey);
		if (unreadAnchorId != null && loaded.some((m) => m.id === unreadAnchorId)) return;

		const at = page.findIndex((m) => m.id === newestBefore);
		const me = usersState.loggedInUser?.id;
		unreadAnchorId = page.slice(at + 1).find((m) => m.user_id !== me)?.id ?? null;
	}

	type RowOffset = { id: string; offset: number };

	/** The rows at the top of the view, with their distance from it. */
	function visibleRows(): RowOffset[] {
		const el = messageWrapper;
		if (!el) return [];
		const top = el.getBoundingClientRect().top;
		const rows: RowOffset[] = [];
		for (const row of el.querySelectorAll<HTMLElement>('[data-message-id]')) {
			const rect = row.getBoundingClientRect();
			if (rect.bottom <= top) continue;
			rows.push({ id: row.dataset.messageId!, offset: rect.top - top });
			if (rows.length === 10) break;
		}
		return rows;
	}

	/** Scroll so the first of `rows` still on screen sits where it was. */
	function keepRowsInPlace(rows: RowOffset[]) {
		const el = messageWrapper;
		if (!el) return;
		const top = el.getBoundingClientRect().top;
		for (const { id, offset } of rows) {
			const row = el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
			if (!row) continue;
			el.scrollTop += row.getBoundingClientRect().top - top - offset;
			return;
		}
	}

	const HIGHLIGHT_MS = 1500;

	function isLoaded(id: string) {
		return messagesState.messages(threadKey).some((m) => m.id === id);
	}

	// The window being fetched for a jump, so a resync waits for it instead of making it stale.
	let pendingWindow: Promise<unknown> | null = null;
	let windowRequest = 0;
	// Bumped when the user goes back to the present, which supersedes a window still being fetched.
	let presentRequest = 0;

	async function openWindow(id: string): Promise<'shown' | 'stale' | JumpFailure> {
		const run: Promise<'shown' | 'stale' | JumpFailure> = loadWindow(id).finally(() => {
			if (pendingWindow === run) pendingWindow = null;
		});
		pendingWindow = run;
		return run;
	}

	/** Replaces the loaded messages with a window around `id`, which the API serves. */
	async function loadWindow(id: string): Promise<'shown' | 'stale' | JumpFailure> {
		const key = threadKey;
		const token = loadToken;
		const request = ++windowRequest;
		const present = presentRequest;
		const superseded = () =>
			request !== windowRequest ||
			present !== presentRequest ||
			token !== loadToken ||
			key !== threadKey ||
			destroyed;
		messagesState.beginNewestLoad(key);

		let pageData: MessagePage;
		try {
			pageData = await fetchPage({ around: id });
		} catch (e) {
			return superseded() ? 'stale' : jumpFailure(e);
		}
		if (superseded()) return 'stale';

		loadToken++;
		older.reset();
		newer.reset();
		const unseen = messagesState.newerExists(key)
			? []
			: messagesBelow(messagesState.messages(key), seenThrough);
		const ascending = [...pageData.messages].reverse();
		nextCursor = pageData.next_cursor;
		fromCache = false;
		cachedTail = null;
		staleOlder = false;
		applyPage(key, ascending, {
			hasMore: pageData.has_more,
			hasNewer: pageData.has_newer ?? false,
			focus: true,
			unseen
		});
		db.messages.bulkPut(ascending).catch((e) => console.warn('Failed to cache messages', e));
		return 'shown';
	}

	async function revealRow(id: string, behavior: ScrollBehavior) {
		await tick();
		const row = messageWrapper?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
		if (!row) return;
		row.scrollIntoView({ block: 'center', behavior });
		row.classList.add('bg-accent');
		setTimeout(() => row.classList.remove('bg-accent'), HIGHLIGHT_MS);
	}

	async function jumpToMessage(
		id: string,
		{ behavior = 'smooth' }: { behavior?: ScrollBehavior } = {}
	) {
		if (isLoaded(id)) return revealRow(id, behavior);
		if (fromCache) {
			toast(JUMP_FAILURE_TOAST.offline);
			return;
		}

		const outcome = await openWindow(id);
		if (outcome === 'stale') return;
		if (outcome === 'shown') return revealRow(id, 'instant');
		toast(JUMP_FAILURE_TOAST[outcome]);
		if (outcome === 'gone') {
			db.messages.delete(id).catch((e) => console.warn('Failed to drop deleted message', e));
		}
	}

	async function jumpToSearchHit(id: string) {
		const key = threadKey;
		await jumpToMessage(id, { behavior: 'instant' });
		if (key === threadKey) onJumped?.();
	}

	$effect(() => {
		const id = jumpTo;
		if (!id) {
			jumpDone = null;
			return;
		}
		if (loadState !== 'ready' || loadedKey !== threadKey) return;
		const done = `${threadKey}:${id}`;
		if (jumpDone === done) return;
		jumpDone = done;
		untrack(() => jumpToSearchHit(id));
	});

	// Reload only when the thread itself changes. loadMessages reads message
	// state, so without untrack this effect would re-fire on every send, receive
	// or older-page prepend — reloading the newest page and snapping to bottom.
	$effect(() => {
		const key = threadKey;
		untrack(() => loadMessages(key));
	});

	// Stay at the bottom when the list gets shorter or taller, if it was there before.
	$effect(() => {
		const el = messageWrapper;
		if (!el) return;
		viewHeight = el.clientHeight;
		const observer = new ResizeObserver(() => {
			if (el.clientHeight === viewHeight) return;
			viewHeight = el.clientHeight;
			if (stickToBottom) scrollToBottom();
			farFromBottom = isFarFromBottom(el);
		});
		observer.observe(el);
		return () => observer.disconnect();
	});

	let seenGeneration = resyncState.generation;
	$effect(() => {
		const generation = resyncState.generation;
		if (generation === seenGeneration) return;
		seenGeneration = generation;
		untrack(() => resync());
	});

	// Also ask for older history when the top of the list scrolls into view; scrolling covers the rest.
	$effect(() => {
		const root = messageWrapper;
		const sentinel = topSentinel;
		if (!root || !sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) void older.request();
			},
			{ root, rootMargin: `${NEAR_TOP_PX}px 0px 0px 0px` }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	// Also ask for newer messages when the bottom of a window scrolls into view.
	$effect(() => {
		const root = messageWrapper;
		const sentinel = bottomSentinel;
		if (!root || !sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) void newer.request();
			},
			{ root, rootMargin: `0px 0px ${NEAR_BOTTOM_PX}px 0px` }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	function measureFar() {
		if (messageWrapper) farFromBottom = isFarFromBottom(messageWrapper);
	}

	function isOwnUnsent(message: MessageType) {
		return message.status === 'pending' && message.user_id === usersState.loggedInUser?.id;
	}

	// Pin the view to the bottom when a new message lands there, but never when
	// older history is prepended (the newest id is unchanged in that case). Sending
	// from further up brings the view down to the message.
	$effect(() => {
		const newest = messagesState.messages(threadKey).at(-1);
		if (!newest || newest.id === autoScrollAnchorId) return;

		autoScrollAnchorId = newest.id;
		untrack(() => {
			if (loadedKey === threadKey && isOwnUnsent(newest)) presentRequest++;
			if (stickToBottom) tick().then(scrollToBottom);
			else if (loadedKey === threadKey && isOwnUnsent(newest)) void jumpToLatest();
			else tick().then(measureFar);
		});
	});

	$effect(() => {
		if (!stickToBottom || loadedKey !== threadKey) return;
		const newest = messagesState.messages(threadKey).at(-1);
		seenThrough = newest ? { id: newest.id, timestamp: newest.timestamp } : null;
	});

	const newCount = $derived.by(() => {
		const me = usersState.loggedInUser?.id ?? null;
		if (messagesState.newerExists(threadKey)) {
			return countHeldBack(messagesState.heldBack(threadKey), me);
		}
		return countNewBelow(messagesState.messages(threadKey), seenThrough, me);
	});

	const showJump = $derived(
		loadState === 'ready' &&
			loadedKey === threadKey &&
			showJumpButton({
				newerExists: messagesState.newerExists(threadKey),
				atBottom: stickToBottom,
				far: farFromBottom,
				newCount
			})
	);

	async function jumpToLatest() {
		presentRequest++;
		if (messagesState.newerExists(threadKey)) {
			await loadMessages(threadKey);
			return;
		}
		stickToBottom = true;
		markNewestRead();
		await tick();
		const el = messageWrapper;
		if (!el) return;
		const behavior = jumpBehavior(el, matchMedia('(prefers-reduced-motion: reduce)').matches);
		if (behavior === 'smooth') startSmoothJump();
		el.scrollTo({ top: el.scrollHeight, behavior });
	}

	function escapeTaken(): boolean {
		const editingId = messageEditState.editingId;
		const editingHere =
			editingId != null && messagesState.messages(threadKey).some((m) => m.id === editingId);
		if (hasEscapeLayer() || replyState.target[threadKey] || editingHere) return true;
		const focused = document.activeElement;
		return isEditable(focused) && !focused?.closest('[data-message-composer]');
	}

	function handleEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		const desktop = !phoneState.phone && !phoneState.navCoversContent;
		if (
			!escapeJumpsToLatest(event, { desktop, buttonShown: showJump, escapeTaken: escapeTaken() })
		) {
			return;
		}
		event.preventDefault();
		void jumpToLatest();
	}

	documentFocusState.attach();

	// The thread is active when it's the one this list shows and the page is in front of the
	// user — never just because a message arrived while we're hidden, unfocused or covered by
	// the phone navigation. It is being read only while its newest messages are in view.
	const active = $derived(trackRead && target != null && documentFocusState.reading);
	const reading = $derived(
		active &&
			stickToBottom &&
			!fromCache &&
			cachedTail == null &&
			loadState === 'ready' &&
			loadedKey === threadKey &&
			!messagesState.newerExists(threadKey)
	);

	$effect(() => {
		if (!trackRead) return;
		const key = threadKey;
		unreadState.setActiveThread(active ? key : null);
		return () => {
			// Only clear if we're still the active thread when this effect tears
			// down — otherwise a newer thread's registration would be wiped out.
			if (unreadState.isActive(key)) unreadState.setActiveThread(null);
		};
	});

	$effect(() => {
		if (!trackRead) return;
		const key = threadKey;
		unreadState.setReadingThread(reading ? key : null);
		return () => {
			if (unreadState.isReading(key)) unreadState.setReadingThread(null);
		};
	});

	function markNewestRead() {
		if (!reading || !target) return;
		const newest = messagesState.messages(threadKey).at(-1);
		if (!newest) return;
		// Our own message moved the server's marker when it was stored; an unsent one isn't stored yet.
		if (newest.user_id === usersState.loggedInUser?.id) return;
		if (readSnapshot()?.lastReadId === newest.id) return;
		unreadState.markThreadRead(target, newest.id);
	}

	// Re-check whenever the thread becomes read-eligible or the newest loaded message
	// changes. markNewestRead reads the read markers itself, so it also runs again if
	// they are moved back while we sit at the bottom.
	$effect(() => {
		const read = reading;
		const newestId = messagesState.messages(threadKey).at(-1)?.id ?? null;
		if (read && newestId) markNewestRead();
	});
</script>

<svelte:window onkeydowncapture={handleEscape} />

<div class="relative flex min-h-0 flex-1 flex-col">
	<div
		bind:this={messageWrapper}
		onscroll={handleScroll}
		onscrollend={() => smoothJumping && endSmoothJump()}
		class="min-h-0 flex-1 overflow-y-auto scrollbar-stable"
	>
		{#if loadState === 'loading'}
			<div class="px-8 pt-6 max-md:px-3">
				<LoadingList rows={6} avatar />
			</div>
		{:else if loadState === 'error'}
			<div class="flex h-full items-center justify-center px-8 max-md:px-3">
				<ErrorState
					title="Couldn’t load messages"
					description={errorDescription}
					onRetry={() => loadMessages(threadKey)}
				/>
			</div>
		{:else if loadState === 'reading'}
			<!-- IndexedDB answers in a few ms: neither the skeleton nor "No messages yet" -->
		{:else if items.length === 0}
			<div class="flex h-full items-center justify-center px-8 max-md:px-3">
				<EmptyState title="No messages yet" description={emptyDescription}>
					{#snippet icon()}
						<MessagesSquare size={20} strokeWidth={1.75} />
					{/snippet}
				</EmptyState>
			</div>
		{:else}
			<div
				class="flex flex-col gap-[18px] px-8 pt-6 pb-2 select-text max-md:px-3 pointer-coarse:select-none"
			>
				<div bind:this={topSentinel} aria-hidden="true"></div>
				{#if older.slow}
					<LoadingList rows={3} avatar label="Loading older messages…" />
				{:else if older.failed}
					<div
						class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-text-subtle"
						role="alert"
					>
						<span>Couldn't load older messages</span>
						<Button
							variant="secondary"
							size="sm"
							disabled={older.loading}
							onclick={() => void older.request(true)}>Retry</Button
						>
					</div>
				{:else if !older.loading && !fromCache && !messagesState.hasMore(threadKey)}
					<p class="text-center text-[13px] text-text-subtle">{beginningLabel}</p>
				{/if}
				{#each items as item (item.key)}
					{#if item.kind === 'date'}
						<DateDivider label={item.label} />
					{:else if item.kind === 'unread'}
						<UnreadDivider />
					{:else}
						<MessageGroup messages={item.messages} onJumpToMessage={jumpToMessage} />
					{/if}
				{/each}
				{#if newer.slow}
					<LoadingList rows={3} avatar label="Loading newer messages…" />
				{:else if newer.failed}
					<div
						class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-text-subtle"
						role="alert"
					>
						<span>Couldn't load newer messages</span>
						<Button
							variant="secondary"
							size="sm"
							disabled={newer.loading}
							onclick={() => void newer.request(true)}>Retry</Button
						>
					</div>
				{/if}
				<div bind:this={bottomSentinel} class="-mt-[18px]" aria-hidden="true"></div>
			</div>
		{/if}
	</div>

	{#if showJump}
		<button
			type="button"
			aria-label={jumpLabel(newCount)}
			onclick={() => void jumpToLatest()}
			transition:fade={{ duration: 120 }}
			class="absolute right-8 bottom-3 z-10 flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full border border-border bg-surface-input px-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-md:right-3 pointer-coarse:h-11 pointer-coarse:min-w-11"
		>
			{#if newCount > 0}
				<span>{newCount > 99 ? '99+' : newCount} new</span>
			{/if}
			<ArrowDown size={16} strokeWidth={1.75} aria-hidden="true" />
		</button>
	{/if}
</div>
