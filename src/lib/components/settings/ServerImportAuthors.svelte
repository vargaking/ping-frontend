<script lang="ts">
	import { Search } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import type { ServerMember } from '$lib/types/server.types';
	import type { AuthorMapping, ImportAuthor } from '$lib/types/serverImport.types';
	import {
		count,
		listCapped,
		mappedCount,
		matchAuthorsFile,
		mappingChanged
	} from '$lib/utils/serverImport';

	type Props = {
		authors: ImportAuthor[];
		mapping: AuthorMapping;
		/** null while the members are loading. */
		members: ServerMember[] | null;
		membersFailed: boolean;
		onretry: () => void;
		/** Saves the picks; "Save" quietly in a ready import, "Apply" in a finished one. */
		actionLabel: string;
		alwaysShowAction: boolean;
		busy: boolean;
		error: string | null;
		onaction: () => void;
	};

	let {
		authors,
		mapping = $bindable(),
		members,
		membersFailed,
		onretry,
		actionLabel,
		alwaysShowAction,
		busy,
		error,
		onaction
	}: Props = $props();

	const SEARCH_FROM = 8;
	const FIRST_ROWS = 50;
	const selectClass =
		'h-9 w-48 shrink-0 rounded-[10px] border border-input bg-surface-input px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

	let query = $state('');
	let showAll = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let fileResult = $state<{
		matched: number;
		noMember: string[];
		notInExport: string[];
	} | null>(null);
	let fileError = $state<string | null>(null);

	const roster = $derived(
		(members ?? [])
			.map((m) => m.user)
			.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }))
	);
	const knownIds = $derived(new Set(roster.map((u) => u.id)));
	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return needle ? authors.filter((a) => a.name.toLowerCase().includes(needle)) : authors;
	});
	const visible = $derived(showAll ? filtered : filtered.slice(0, FIRST_ROWS));
	const mapped = $derived(mappedCount(authors, mapping));
	const dirty = $derived(mappingChanged(authors, mapping));

	function pick(authorId: string, value: string) {
		mapping = { ...mapping, [authorId]: value === '' ? null : Number(value) };
	}

	async function loadFile(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file) return;
		fileResult = null;
		fileError = null;
		let text: string;
		try {
			text = await file.text();
		} catch {
			fileError = "Couldn't read that file.";
			return;
		}
		const result = matchAuthorsFile(
			text,
			authors,
			roster.map((u) => ({ id: u.id, username: u.username }))
		);
		if (!result.ok) {
			fileError = result.error;
			return;
		}
		mapping = { ...mapping, ...result.matched };
		fileResult = {
			matched: Object.keys(result.matched).length,
			noMember: result.noMember,
			notInExport: result.notInExport
		};
	}
</script>

<section aria-labelledby="import-authors-heading" class="flex flex-col gap-3">
	<div class="flex items-baseline justify-between gap-3">
		<h3 id="import-authors-heading" class="text-sm font-semibold">Authors</h3>
		<span aria-live="polite" class="font-mono text-[11px] text-text-subtle">
			{mapped} of {authors.length} matched
		</span>
	</div>
	<p class="text-[13px] text-muted-foreground">
		Messages from authors you don't match stay under their original name with an "Imported" label.
		You can match them later.
	</p>

	{#if membersFailed}
		<ErrorState
			title="Couldn’t load members"
			description="There was a problem reaching the server."
			onRetry={onretry}
		/>
	{:else if members === null}
		<LoadingList rows={3} />
	{:else}
		<div class="flex items-center gap-2">
			{#if authors.length > SEARCH_FROM}
				<label
					class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-input bg-surface-input px-3 focus-within:border-ring"
				>
					<span class="sr-only">Search authors</span>
					<Search size={16} strokeWidth={1.75} class="shrink-0 text-text-subtle" />
					<input
						type="search"
						bind:value={query}
						oninput={() => (showAll = false)}
						placeholder="Search authors"
						class="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-text-subtle focus:ring-0"
					/>
				</label>
			{/if}
			<Button variant="secondary" class="ml-auto" onclick={() => fileInput?.click()}>
				Load authors.json
			</Button>
			<input
				bind:this={fileInput}
				type="file"
				accept=".json,application/json"
				class="hidden"
				tabindex="-1"
				aria-hidden="true"
				onchange={loadFile}
			/>
		</div>

		{#if fileError}
			<p role="alert" class="text-xs text-destructive">{fileError}</p>
		{:else if fileResult}
			<div aria-live="polite" class="flex flex-col gap-1 text-xs text-text-subtle">
				<p>{fileResult.matched} matched</p>
				{#if fileResult.noMember.length > 0}
					<p>No member named: {listCapped(fileResult.noMember)}</p>
				{/if}
				{#if fileResult.notInExport.length > 0}
					<p>Not in this export: {listCapped(fileResult.notInExport)}</p>
				{/if}
			</div>
		{/if}

		<ul aria-label="Authors" class="flex flex-col">
			{#each visible as author (author.id)}
				{@const userId = mapping[author.id] ?? null}
				<li
					class="flex items-center gap-3 rounded-lg px-3 py-1.5 focus-within:bg-card hover:bg-card"
				>
					<span class="min-w-0 flex-1 truncate text-sm">{author.name}</span>
					<span class="shrink-0 font-mono text-[11px] text-text-subtle">
						{count(author.messages, 'message')}
					</span>
					<select
						aria-label="Member for {author.name}"
						value={userId === null ? '' : String(userId)}
						onchange={(e) => pick(author.id, e.currentTarget.value)}
						class={selectClass}
					>
						<option value="">Not matched</option>
						{#if userId !== null && !knownIds.has(userId)}
							<option value={String(userId)}>Unknown member</option>
						{/if}
						{#each roster as user (user.id)}
							<option value={String(user.id)}>{user.username}</option>
						{/each}
					</select>
				</li>
			{:else}
				<li class="px-3 py-4 text-sm text-text-subtle">No authors match “{query.trim()}”.</li>
			{/each}
		</ul>

		{#if !showAll && filtered.length > FIRST_ROWS}
			<Button variant="ghost" class="w-fit" onclick={() => (showAll = true)}>
				Show all {filtered.length}
			</Button>
		{/if}

		{#if alwaysShowAction || dirty}
			<div class="flex flex-col gap-2">
				{#if error}
					<p role="alert" class="text-xs text-destructive">{error}</p>
				{/if}
				<div>
					<Button variant="secondary" disabled={!dirty || busy} onclick={onaction}>
						{busy ? 'Saving…' : actionLabel}
					</Button>
				</div>
			</div>
		{/if}
	{/if}
</section>
