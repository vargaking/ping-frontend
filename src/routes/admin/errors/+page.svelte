<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { RefreshCw } from 'lucide-svelte';
	import { getAdminErrors } from '$lib/requests/admin/getAdminErrors';
	import { getErrorMessage } from '$lib/requests/errors';
	import { timeAgo } from '$lib/utils/timeAgo';
	import type { AdminErrorGroup, AdminErrorList, AdminErrorSource } from '$lib/types/admin.types';
	import Button from '$lib/components/ui/button/button.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';

	type Filter = AdminErrorSource | 'all';
	const filters: { id: Filter; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'client', label: 'Client' },
		{ id: 'server', label: 'Server' }
	];
	const SOURCE_LABEL: Record<AdminErrorSource, string> = { client: 'Client', server: 'Server' };

	const filter = $derived<Filter>(
		page.url.searchParams.get('source') === 'client'
			? 'client'
			: page.url.searchParams.get('source') === 'server'
				? 'server'
				: 'all'
	);

	let list = $state<AdminErrorList | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let open = $state<Record<number, boolean>>({});

	async function load(next: Filter = filter) {
		loading = true;
		loadError = null;
		try {
			const result = await getAdminErrors(next === 'all' ? undefined : next);
			if (next !== filter) return;
			list = result;
			open = {};
		} catch (e) {
			console.warn('Failed to load admin errors', e);
			if (next === filter) loadError = getErrorMessage(e);
		} finally {
			if (next === filter) loading = false;
		}
	}

	$effect(() => {
		void load(filter);
	});

	function select(next: Filter) {
		const url = new URL(page.url);
		if (next === 'all') url.searchParams.delete('source');
		else url.searchParams.set('source', next);
		void goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	const target = (group: AdminErrorGroup) => [group.method, group.path].filter(Boolean).join(' ');
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-4">
	<div class="flex items-center justify-between gap-4">
		<h2 class="text-lg font-semibold">Errors</h2>
		<div class="flex items-center gap-2">
			<div role="group" aria-label="Source" class="flex gap-1 rounded-lg bg-surface-input p-1">
				{#each filters as f (f.id)}
					<button
						type="button"
						aria-pressed={filter === f.id}
						onclick={() => select(f.id)}
						class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {filter ===
						f.id
							? 'bg-accent text-foreground shadow-xs'
							: 'text-text-subtle hover:text-foreground'}"
					>
						{f.label}
					</button>
				{/each}
			</div>
			<Button
				variant="secondary"
				size="icon"
				aria-label="Refresh"
				disabled={loading}
				onclick={() => load()}
			>
				<RefreshCw size={16} strokeWidth={1.75} class={loading ? 'animate-spin' : ''} />
			</Button>
		</div>
	</div>

	{#if list}
		<p class="text-sm text-text-subtle">
			Last {list.limit} errors of each kind since restart {timeAgo(list.since)}.
		</p>
	{/if}

	{#if loading && !list}
		<LoadingList rows={4} />
	{:else if loadError && !list}
		<ErrorState description={loadError} onRetry={() => load()} />
	{:else if list}
		{#if loadError}
			<p class="text-sm text-destructive" role="alert">Couldn't refresh: {loadError}</p>
		{/if}
		{#if list.groups.length === 0}
			<EmptyState title="No errors since restart" />
		{:else}
			<ul class="flex flex-col divide-y divide-border rounded-xl border border-border">
				{#each list.groups as group, i (`${group.source}|${group.kind}|${group.message}|${group.method}|${group.path}`)}
					<li class="flex flex-col gap-1.5 px-4 py-3">
						<div class="flex items-center gap-2 text-sm">
							<span
								class="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium text-text-subtle"
							>
								{SOURCE_LABEL[group.source]}
							</span>
							<span class="shrink-0 font-medium">{group.kind}</span>
							{#if group.count > 1}
								<span class="shrink-0 text-text-subtle tabular-nums">×{group.count}</span>
							{/if}
							<span class="ml-auto shrink-0 text-xs text-text-subtle" title={group.last_at}>
								{timeAgo(group.last_at)}
							</span>
						</div>
						<p class="truncate text-sm text-muted-foreground" title={group.message}>
							{group.message}
						</p>
						<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
							{#if target(group)}
								<span class="font-mono">{target(group)}</span>
							{/if}
							{#if group.user_id !== null}
								<span class="font-mono">user {group.user_id}</span>
							{/if}
							{#if group.request_id}
								<span class="font-mono">request {group.request_id}</span>
							{/if}
							{#if group.stack}
								<button
									type="button"
									aria-expanded={open[i] === true}
									aria-controls="stack-{i}"
									onclick={() => (open[i] = !open[i])}
									class="rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								>
									{open[i] ? 'Hide stack' : 'Show stack'}
								</button>
							{/if}
						</div>
						{#if group.stack && open[i]}
							<pre
								id="stack-{i}"
								class="max-h-80 overflow-auto rounded-lg bg-surface-input p-3 font-mono text-xs">{group.stack}</pre>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
