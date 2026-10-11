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
	import type { MessagePage } from '$lib/requests/channels/getChannelMessages';
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
	import {
		countNewBelow,
		escapeJumpsToLatest,
		isAtBottom,
		isFarFromBottom,
		jumpBehavior,
		jumpLabel,
		showJumpButton,
		type SeenMarker
	} from '$lib/utils/jumpToLatest';
	import { hasEscapeLayer, isEditable } from '$lib/utils/openLayer';
	import { NEAR_TOP_PX, OlderHistory } from '$lib/utils/olderHistory.svelte';

	type Props = {
		/** messagesState key of the thread shown (see threadKey). */
		threadKey: string;
		/** Channel or DM this list belongs to — drives read-state tracking. */
		target: MessageTarget | null;
		/** Newest-first page of history, older than `before` when given. */
		fetchPage: (before?: string | null) => Promise<MessagePage>;
		/** Cached messages (oldest first), used when the API is unreachable. */
		readCache: () => Promise<MessageType[]>;
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
		readCache,
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
	let loadState = $state<'loading' | 'error' | 'ready'>('loading');
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
		farFromBottom = isFarFromBottom(el);
		void older.request();
		if (el.clientHeight !== viewHeight) return;
		stickToBottom = isAtBottom(el);
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

	function applyPage(key: string, messages: MessageType[], hasMore: boolean) {
		messagesState.set(key, messages, hasMore);
		autoScrollAnchorId = messagesState.messages(key).at(-1)?.id ?? null;
		const jumping = jumpTo != null && jumpDone !== `${key}:${jumpTo}`;
		stickToBottom = !jumping;
		farFromBottom = false;
		stopSmoothJump();
		const newest = messagesState.messages(key).at(-1);
		seenThrough = newest ? { id: newest.id, timestamp: newest.timestamp } : null;

		// Pin the unread divider to the message right after the boundary, once. If
		// the boundary is older than this page, anchor on the first loaded message.
		// A thread that was never read (no marker) gets no divider.
		const boundary = unreadBoundaryId;
		if (boundary != null) {
			const idx = messages.findIndex((m) => m.id === boundary);
			unreadAnchorId = idx >= 0 ? (messages[idx + 1]?.id ?? null) : (messages[0]?.id ?? null);
		} else {
			unreadAnchorId = null;
		}

		loadedKey = key;
		loadState = 'ready';
		opening = true;
		if (openingTimer) clearTimeout(openingTimer);
		tick().then(() => {
			if (destroyed) return;
			scrollToBottom();
			openingTimer = setTimeout(() => {
				if (stickToBottom) scrollToBottom();
				opening = false;
				void older.request();
			}, 100);
		});
	}

	async function loadMessages(key: string) {
		const token = ++loadToken;
		nextCursor = null;
		older.reset();
		messagesState.beginNewestLoad(key);

		// Only flash the skeleton on a first visit, when there's nothing cached
		// for this thread yet. Revisits keep their messages on screen while we
		// refresh, so the switch doesn't flicker.
		if (messagesState.messages(key).length === 0) loadState = 'loading';

		// Snapshot the read markers BEFORE marking the thread read, so the divider
		// anchors on what was actually unread when we opened it.
		const snapshot = readSnapshot();
		unreadBoundaryId =
			snapshot && snapshot.lastMessageId != null && snapshot.lastMessageId !== snapshot.lastReadId
				? snapshot.lastReadId
				: null;

		try {
			// The API is the source of truth for the newest page; Dexie is a cache.
			const pageData = await fetchPage();
			if (token !== loadToken) return; // a newer switch superseded us

			const ascending = [...pageData.messages].reverse();
			nextCursor = pageData.next_cursor;
			fromCache = false;
			staleOlder = false;
			applyPage(key, ascending, pageData.has_more);
			db.messages.bulkPut(ascending).catch((e) => console.warn('Failed to cache messages', e));
		} catch (e) {
			if (token !== loadToken) return;
			if (onNotFound && normalizeError(e).status === 404) {
				messagesState.endNewestLoad(key);
				onNotFound();
				return;
			}
			console.warn('Failed to load messages from API, falling back to cache', e);
			try {
				const cached = await readCache();
				if (token !== loadToken) return;
				nextCursor = null;
				fromCache = true;
				applyPage(key, cached, false);
			} catch (cacheError) {
				if (token !== loadToken) return;
				console.error('Failed to load messages', cacheError);
				messagesState.endNewestLoad(key);
				if (messagesState.messages(key).length === 0) loadState = 'error';
			}
		}
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

	const older = new OlderHistory<MessagePage>({
		metrics: () => messageWrapper ?? null,
		available: () =>
			!destroyed &&
			!opening &&
			loadedKey === threadKey &&
			messagesState.hasMore(threadKey) &&
			nextCursor != null,
		fetch: () => fetchPage(nextCursor),
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

	onDestroy(() => {
		destroyed = true;
		loadToken++;
		older.reset();
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
		if (loadState !== 'ready' || fromCache) return loadMessages(key);
		await older.idle();
		if (key !== threadKey) return;

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

	const MAX_JUMP_PAGES = 10;
	const MAX_SEARCH_JUMP_PAGES = 20;
	const HIGHLIGHT_MS = 1500;

	type JumpOptions = {
		maxPages?: number;
		behavior?: ScrollBehavior;
		/** Runs when the message isn't found after loading `maxPages` older pages. */
		onMissing?: () => void;
	};

	function isLoaded(id: string) {
		return messagesState.messages(threadKey).some((m) => m.id === id);
	}

	async function jumpToMessage(
		id: string,
		{
			maxPages = MAX_JUMP_PAGES,
			behavior = 'smooth',
			onMissing = () => toast.error("Couldn't find the original message")
		}: JumpOptions = {}
	) {
		const key = threadKey;
		for (let pages = 0; !isLoaded(id) && pages < maxPages; pages++) {
			if (!messagesState.hasMore(key) || !nextCursor) break;
			const result = await older.load();
			if (key !== threadKey || destroyed) return;
			if (!result.ok) {
				toast.error("Couldn't load older messages");
				return;
			}
		}

		if (!isLoaded(id)) {
			onMissing();
			return;
		}

		await tick();
		const row = messageWrapper?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
		if (!row) return;
		row.scrollIntoView({ block: 'center', behavior });
		row.classList.add('bg-accent');
		setTimeout(() => row.classList.remove('bg-accent'), HIGHLIGHT_MS);
	}

	function reportMissingHit(id: string) {
		if (fromCache) {
			toast("Couldn't open that message while offline.");
		} else if (messagesState.hasMore(threadKey)) {
			toast('That message is too far back to open here yet.');
		} else {
			// The whole thread is loaded and the message isn't in it.
			toast('That message no longer exists.');
			db.messages.delete(id).catch((e) => console.warn('Failed to drop deleted message', e));
		}
	}

	async function jumpToSearchHit(id: string) {
		const key = threadKey;
		await jumpToMessage(id, {
			maxPages: MAX_SEARCH_JUMP_PAGES,
			behavior: 'instant',
			onMissing: () => reportMissingHit(id)
		});
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

	const newCount = $derived(
		countNewBelow(
			messagesState.messages(threadKey),
			seenThrough,
			usersState.loggedInUser?.id ?? null
		)
	);

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
