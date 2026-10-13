<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { Search, X } from 'lucide-svelte';
	import { forumState } from '$lib/states/forumState.svelte';
	import { conversationsState } from '$lib/states/conversationsState.svelte';
	import { historySyncState } from '$lib/states/historySyncState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { searchState } from '$lib/states/searchState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import type { StoredMessage, StoredPost } from '$lib/types/localHistory.types';
	import { localHistoryReady } from '$lib/utils/db';
	import { requestPersistence } from '$lib/utils/persistentStorage';
	import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
	import type { SearchScope } from '$lib/utils/messageSearch';
	import { openSearchResult, type SearchResult } from '$lib/utils/openSearchResult';
	import { FILTER_HINTS } from '$lib/utils/searchQuery';
	import SearchMessageRow from './SearchMessageRow.svelte';
	import SearchPostRow from './SearchPostRow.svelte';
	import { mentionCandidates } from '$lib/utils/mentions';
	import { weekStartDay } from '$lib/utils/quickDates';
	import { authorPool } from '$lib/utils/searchAuthors';
	import { insertTerm, joinChips, splitChips, unchip } from '$lib/utils/searchChips';
	import { buildSuggestions, suggestionContext } from '$lib/utils/searchSuggestions';

	type Chip = { label: string; scope: SearchScope };
	type Item = { kind: 'post'; post: StoredPost } | { kind: 'message'; message: StoredMessage };

	const EVERYWHERE: SearchScope = { kind: 'everywhere' };

	const routeId = $derived(page.route.id ?? '');
	const numberParam = (name: 'serverId' | 'channelId' | 'postId' | 'conversationId') => {
		const value = parseInt(page.params[name] ?? '');
		return Number.isNaN(value) ? null : value;
	};

	const chips = $derived.by<Chip[]>(() => {
		const chips: Chip[] = [{ label: 'Everywhere', scope: EVERYWHERE }];
		const serverId = numberParam('serverId');
		const channelId = numberParam('channelId');
		const postId = numberParam('postId');
		const conversationId = numberParam('conversationId');

		if (serverId != null && routeId.startsWith('/app/server/')) {
			const name = serversState.servers[serverId]?.name;
			if (name) chips.push({ label: name, scope: { kind: 'server', serverId } });
		}
		if (channelId != null && /\/(channel|forum)\/\[channelId\]$/.test(routeId)) {
			const name = unreadState.channelName(channelId);
			if (name) chips.push({ label: `#${name}`, scope: { kind: 'channel', channelId } });
		}
		if (postId != null && routeId.endsWith('/forum/[channelId]/[postId]')) {
			const title = forumState.post(postId)?.title;
			if (title) chips.push({ label: title, scope: { kind: 'post', postId } });
		}
		if (conversationId != null && routeId === '/app/direct/[conversationId]') {
			const partner = conversationsState.conversations[conversationId]?.other_user;
			if (partner) {
				const name = (usersState.users[partner.id] ?? partner).username;
				chips.push({ label: name, scope: { kind: 'direct', conversationId } });
			}
		}
		return chips;
	});

	// Posts come first, so a message's index in the list is offset by the post count.
	const items = $derived<Item[]>([
		...searchState.posts.map((post): Item => ({ kind: 'post', post })),
		...searchState.hits.map((message): Item => ({ kind: 'message', message }))
	]);
	const postCount = $derived(searchState.posts.length);
	const optionId = (index: number) => `search-option-${index}`;
	const suggestionId = (index: number) => `search-suggestion-${index}`;

	let storage = $state<'checking' | 'ready' | 'blocked'>('checking');
	let input = $state<HTMLInputElement>();
	let scroller = $state<HTMLDivElement>();
	let sentinel = $state<HTMLDivElement>();
	let active = $state(0);

	const searched = $derived(searchState.status !== 'idle');
	const showHints = $derived(!searched && searchState.query.trim() === '');
	const showResults = $derived(items.length > 0);
	const nothingFound = $derived(searchState.status === 'ready' && items.length === 0);
	const downloadOff = $derived(storage === 'ready' && historySyncState.status === 'off');
	const downloading = $derived(
		storage === 'ready' && historySyncState.status !== 'done' && !downloadOff
	);
	const countLabel = $derived(
		searchState.total === null
			? 'Messages'
			: `${searchState.total.toLocaleString()} ${searchState.total === 1 ? 'message' : 'messages'}`
	);

	const firstDay = weekStartDay(typeof navigator === 'undefined' ? undefined : navigator.language);
	const split = $derived(splitChips(searchState.query));
	/** Null while a range is selected. */
	let caret = $state<number | null>(null);
	let pickedKey = $state<string | null>(null);
	let dismissedKey = $state<string | null>(null);

	const target = $derived.by(() => {
		const scope = searchState.scope;
		if (scope.kind === 'server') return { serverId: scope.serverId };
		if (scope.kind === 'channel' || scope.kind === 'post')
			return { serverId: numberParam('serverId') };
		if (scope.kind === 'direct') return { conversationId: scope.conversationId };
		return {};
	});
	const pool = $derived(
		authorPool(searchState.authors, mentionCandidates(target), usersState.users)
	);
	const context = $derived(
		storage === 'ready' && caret !== null
			? suggestionContext(
					split.rest,
					caret,
					split.chips.some((chip) => chip.filter === 'from')
				)
			: null
	);
	const suggestions = $derived(
		context ? buildSuggestions(context, { authors: pool, now: new Date(), firstDay }) : []
	);
	const contextKey = $derived(context ? `${context.kind}:${context.term.start}` : null);
	const pick = $derived(
		Math.max(
			0,
			suggestions.findIndex((s) => s.key === pickedKey)
		)
	);
	const mode = $derived<'suggestions' | 'results' | 'none'>(
		suggestions.length > 0 && contextKey !== dismissedKey
			? 'suggestions'
			: showResults
				? 'results'
				: 'none'
	);
	const listboxId = $derived(mode === 'suggestions' ? 'search-suggestions' : 'search-results');
	const needsProfiles = $derived(context?.kind === 'author');

	onMount(() => {
		input?.focus();
		input?.select();
		if (!chips.some((chip) => searchState.isScope(chip.scope))) searchState.setScope(EVERYWHERE);
		void localHistoryReady().then((ready) => (storage = ready ? 'ready' : 'blocked'));
		void requestPersistence();
	});

	// New results start from the top.
	$effect(() => {
		void searchState.tokens;
		void searchState.has;
		void searchState.scope;
		active = 0;
	});

	function syncCaret() {
		if (!input) return;
		caret = input.selectionStart === input.selectionEnd ? input.selectionStart : null;
	}

	/** Every edit comes through here: the chips are cut out of the full text again, the query
	 *  gets the chips' text plus the rest, and the input gets its rest and caret back. */
	async function apply(full: string, fullCaret: number, placeCaret = true) {
		const next = splitChips(full, fullCaret);
		pickedKey = null;
		dismissedKey = null;
		searchState.setQuery(joinChips(next.chips, next.rest));
		caret = next.caret;
		await tick();
		if (!input) return;
		if (input.value !== next.rest) input.value = next.rest;
		if (placeCaret) input.setSelectionRange(next.caret, next.caret);
	}

	function onInput(event: Event) {
		if (!input) return;
		const full = joinChips(split.chips, input.value);
		const fullCaret = joinChips(split.chips, '').length + (input.selectionStart ?? 0);
		const composing = (event as InputEvent).isComposing;
		// Writing to the input mid-composition breaks the IME (Android keyboards compose every
		// word), so a change that would move text into a chip waits for compositionend.
		if (composing && splitChips(full, fullCaret).rest !== input.value) return;
		void apply(full, fullCaret, !composing);
	}

	function insertFilter(text: string) {
		void apply(text, text.length);
		input?.focus();
	}

	function unchipAt(index: number) {
		const result = unchip(split, index);
		void apply(result.query, result.caret);
		input?.focus();
	}

	function choose(index: number) {
		const suggestion = suggestions[index];
		if (!suggestion || !context) return;
		const next = insertTerm(split.rest, context.term, suggestion.insert);
		const prefix = joinChips(split.chips, '');
		void apply(prefix + next.rest, prefix.length + next.caret);
		input?.focus();
	}

	async function movePick(step: number) {
		const next = Math.min(Math.max(pick + step, 0), suggestions.length - 1);
		pickedKey = suggestions[next].key;
		await tick();
		document.getElementById(suggestionId(next))?.scrollIntoView({ block: 'nearest' });
	}

	function toResult(item: Item): SearchResult {
		return item.kind === 'post'
			? { kind: 'post', post: item.post }
			: { kind: 'message', message: item.message };
	}

	function open(index: number) {
		const item = items[index];
		if (item) void openSearchResult(toResult(item));
	}

	async function move(step: number) {
		if (items.length === 0) return;
		active = Math.min(Math.max(active + step, 0), items.length - 1);
		await tick();
		document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.isComposing) return;
		if (
			event.key === 'Backspace' &&
			split.chips.length > 0 &&
			input?.selectionStart === 0 &&
			input.selectionEnd === 0
		) {
			event.preventDefault();
			unchipAt(split.chips.length - 1);
			return;
		}
		if (mode === 'suggestions') {
			onSuggestionKey(event);
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			void move(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			void move(-1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			open(active);
		}
	}

	function onSuggestionKey(event: KeyboardEvent) {
		const plainTab =
			event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			void movePick(event.key === 'ArrowDown' ? 1 : -1);
		} else if (event.key === 'Enter' || plainTab) {
			event.preventDefault();
			choose(pick);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			dismissedKey = contextKey;
		}
	}

	function sentinelInView(): boolean {
		if (!scroller || !sentinel) return false;
		return sentinel.getBoundingClientRect().top <= scroller.getBoundingClientRect().bottom + 100;
	}

	let filling = false;

	// Keeps loading while the end of the list is on screen, which a single intersection
	// event wouldn't do when a page doesn't fill the view.
	async function fillView() {
		if (filling) return;
		filling = true;
		try {
			while (searchState.hasMore && sentinelInView()) {
				const before = searchState.hits.length;
				await searchState.loadMore();
				if (searchState.hits.length === before) break;
				await tick();
			}
		} finally {
			filling = false;
		}
	}

	$effect(() => {
		if (!scroller || !sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void fillView();
			},
			{ root: scroller, rootMargin: '100px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (storage === 'ready') void searchState.loadAuthors();
	});

	$effect(() => {
		if (needsProfiles) void searchState.loadAuthorProfiles();
	});
</script>

<div
	data-fullscreen
	class="flex h-[min(560px,70vh)] w-[min(640px,92vw)] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground max-md:h-[var(--app-height,100dvh)] max-md:w-screen max-md:rounded-none max-md:border-0 max-md:pt-[env(safe-area-inset-top,0px)] max-md:pr-[env(safe-area-inset-right,0px)] max-md:pb-[var(--safe-bottom)] max-md:pl-[env(safe-area-inset-left,0px)]"
>
	<div class="flex shrink-0 items-center gap-3 border-b border-border px-4">
		<Search size={18} strokeWidth={1.75} class="shrink-0 text-text-subtle" aria-hidden="true" />
		<div class="flex min-h-12 min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1.5">
			{#if split.chips.length > 0}
				<ul aria-label="Active filters" class="flex flex-wrap gap-1.5">
					{#each split.chips as chip, i (i)}
						<li class="min-w-0">
							<button
								type="button"
								tabindex="-1"
								onclick={() => unchipAt(i)}
								class="h-7 max-w-full truncate rounded-md border border-border-strong bg-accent px-2 font-mono text-xs text-foreground transition-colors hover:bg-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
							>
								{chip.text}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<input
				bind:this={input}
				type="text"
				role="combobox"
				aria-label="Search messages"
				aria-expanded={mode !== 'none'}
				aria-controls={listboxId}
				aria-activedescendant={mode === 'suggestions'
					? suggestionId(pick)
					: mode === 'results'
						? optionId(active)
						: undefined}
				aria-autocomplete="list"
				placeholder="Search messages and posts"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				disabled={storage === 'blocked'}
				value={split.rest}
				oninput={onInput}
				oncompositionend={onInput}
				onkeydown={onKeydown}
				onkeyup={syncCaret}
				onclick={syncCaret}
				onfocus={syncCaret}
				onselect={syncCaret}
				class="h-9 min-w-32 flex-1 border-0 bg-transparent p-0 text-[15px] text-foreground shadow-none outline-none placeholder:text-text-subtle focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
			/>
		</div>
		<button
			type="button"
			aria-label="Close search"
			onclick={() => overlayState.close()}
			class="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
		>
			<X size={18} strokeWidth={1.75} />
		</button>
	</div>

	<div
		role="group"
		aria-label="Search in"
		class="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-4 py-2"
	>
		{#each chips as chip, i (i)}
			{@const selected = searchState.isScope(chip.scope)}
			<button
				type="button"
				aria-pressed={selected}
				onclick={() => searchState.setScope(chip.scope)}
				class="h-7 max-w-48 shrink-0 truncate rounded-full border px-3 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {selected
					? 'border-border-strong bg-accent text-foreground'
					: 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}"
			>
				{chip.label}
			</button>
		{/each}
	</div>

	<div bind:this={scroller} class="min-h-0 flex-1 overflow-y-auto px-2 py-2 scrollbar-stable">
		{#if storage === 'blocked'}
			<p class="m-auto px-6 py-10 text-center text-sm text-text-subtle">
				Search needs local storage, which this browser is blocking. It doesn't work in private
				windows.
			</p>
		{:else if mode !== 'none'}
			<div
				id={listboxId}
				role="listbox"
				aria-label={mode === 'suggestions' ? 'Suggestions' : 'Search results'}
			>
				{#if mode === 'suggestions'}
					{#each suggestions as suggestion, i (suggestion.key)}
						<button
							id={suggestionId(i)}
							type="button"
							role="option"
							aria-selected={i === pick}
							tabindex="-1"
							onmousedown={(event) => event.preventDefault()}
							onclick={() => choose(i)}
							onmousemove={() => (pickedKey = suggestion.key)}
							class="flex w-full items-baseline gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none {i ===
							pick
								? 'bg-border'
								: ''}"
						>
							<span class="min-w-0 truncate text-sm font-semibold">{suggestion.label}</span>
							{#if suggestion.detail}
								<span class="min-w-0 truncate text-xs text-text-subtle">{suggestion.detail}</span>
							{/if}
						</button>
					{/each}
				{:else}
					{#if searchState.posts.length > 0}
						<div role="group" aria-label="Posts">
							<div aria-hidden="true" class="px-3 pt-1 pb-1 text-xs font-medium text-text-subtle">
								Posts
							</div>
							{#each searchState.posts as post, i (post.id)}
								<SearchPostRow
									{post}
									tokens={searchState.tokens}
									id={optionId(i)}
									active={i === active}
									onOpen={() => open(i)}
									onHover={() => (active = i)}
								/>
							{/each}
						</div>
					{/if}
					{#if searchState.hits.length > 0}
						<div role="group" aria-label="Messages">
							<div aria-hidden="true" class="px-3 pt-3 pb-1 text-xs font-medium text-text-subtle">
								{countLabel}
							</div>
							{#each searchState.hits as message, i (message.id)}
								{@const index = postCount + i}
								<SearchMessageRow
									{message}
									tokens={searchState.tokens}
									has={searchState.has}
									id={optionId(index)}
									active={index === active}
									onOpen={() => open(index)}
									onHover={() => (active = index)}
								/>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
			{#if mode === 'results'}
				<div bind:this={sentinel} class="h-px" aria-hidden="true"></div>
			{/if}
		{:else if nothingFound}
			<p role="status" class="px-6 py-10 text-center text-sm text-text-subtle">Nothing found.</p>
		{:else if showHints}
			<div role="group" aria-label="Filters">
				<div class="px-3 pt-1 pb-1 text-xs font-medium text-text-subtle">Filters</div>
				{#each FILTER_HINTS as hint (hint.insert)}
					<button
						type="button"
						onclick={() => insertFilter(hint.insert)}
						class="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<span class="font-mono text-sm text-foreground">{hint.example}</span>
						<span class="min-w-0 text-xs text-text-subtle">{hint.description}</span>
					</button>
				{/each}
				<p class="px-3 pt-3 text-xs text-text-subtle">
					Search runs on this device, over the history stored here.
				</p>
			</div>
		{:else if !searched}
			<p class="px-6 py-10 text-center text-sm text-text-subtle">
				Search runs on this device, over the history stored here.
			</p>
		{/if}
	</div>

	{#if downloadOff}
		<p class="shrink-0 border-t border-border px-4 py-2 text-xs text-text-subtle">
			History download is off on this device, so only conversations you opened are searchable.
			<button
				type="button"
				onclick={() =>
					overlayState.open(SettingsModal, { category: 'account', tab: 'account-storage' })}
				class="underline underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				Open Storage settings
			</button>
		</p>
	{:else if downloading}
		<p class="shrink-0 border-t border-border px-4 py-2 text-xs text-text-subtle">
			{#if historySyncState.threads === 0}
				History is still downloading. Older messages may be missing.
			{:else}
				History is still downloading ({historySyncState.complete} of {historySyncState.threads} conversations).
				Older messages may be missing.
			{/if}
		</p>
	{/if}
</div>
