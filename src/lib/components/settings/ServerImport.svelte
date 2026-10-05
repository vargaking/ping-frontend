<script lang="ts">
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { serverImportState } from '$lib/states/serverImportState.svelte';
	import { getErrorMessage } from '$lib/requests/errors';
	import { formatBytes } from '$lib/requests/attachments/uploadAttachment';
	import type { ServerMember } from '$lib/types/server.types';
	import type { AuthorMapping, Plan } from '$lib/types/serverImport.types';
	import {
		channelAction,
		channelCounts,
		count,
		existingLine,
		fileProblem,
		mappingChanged,
		mappingOf,
		notImportedLines,
		percent,
		platformName,
		totalsLine
	} from '$lib/utils/serverImport';
	import { isSameUpload } from '$lib/utils/serverImportUpload';
	import Button from '$lib/components/ui/button/button.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import ServerImportAuthors from './ServerImportAuthors.svelte';
	import ServerImportProgress from './ServerImportProgress.svelte';

	const EXPORTER_URL = 'https://github.com/vargaking/discord-export-bot#readme';
	const destructiveOutline =
		'border border-destructive-border bg-transparent text-destructive hover:bg-destructive/10';

	const serverId = $derived(serversState.selectedServer?.id);
	const entry = $derived(serverId != null ? serverImportState.of(serverId) : null);
	const limits = $derived(entry?.limits ?? null);
	const imp = $derived(entry?.import ?? null);
	const upload = $derived(entry?.upload ?? null);
	const source = $derived(imp?.source?.server_name ?? 'the export');

	const view = $derived.by(() => {
		if (!entry || entry.loadStatus === 'loading') return 'loading';
		if (entry.loadStatus === 'error') return 'error';
		if (limits?.max_bytes === 0) return 'off';
		if (upload) return upload.paused ? 'paused' : 'sending';
		if (imp?.status === 'uploading') return 'interrupted';
		return imp?.status ?? 'empty';
	});

	let zipInput: HTMLInputElement | undefined = $state();
	let fileError = $state<string | null>(null);
	let pendingFile = $state<File | null>(null);
	let confirming = $state<'discard' | 'remove' | null>(null);
	let busy = $state<'save' | 'start' | 'retry' | 'discard' | 'cancel' | null>(null);
	let actionError = $state<string | null>(null);
	let saveError = $state<string | null>(null);

	let members = $state<ServerMember[] | null>(null);
	let membersFailed = $state(false);
	let mapping = $state<AuthorMapping>({});
	let syncedAuthors = '';

	$effect(() => {
		if (serverId != null) void serverImportState.load(serverId);
	});

	const needsMembers = $derived(view === 'ready' || view === 'done');

	function loadMembers() {
		const id = serverId;
		if (id == null) return;
		membersFailed = false;
		serversState
			.loadRoster(id)
			.then((loaded) => {
				if (id === serverId) members = loaded;
			})
			.catch((e) => {
				console.error('Failed to fetch members', e);
				if (id === serverId) membersFailed = true;
			});
	}

	$effect(() => {
		if (!needsMembers) return;
		untrack(() => {
			if (members === null && !membersFailed) loadMembers();
		});
	});

	// Picks stay while the server's mapping is unchanged; a new import or a saved mapping replaces them.
	$effect(() => {
		if (!imp) return;
		const key = `${imp.id}|${imp.authors.map((a) => `${a.id}=${a.user_id ?? ''}`).join(',')}`;
		if (key === syncedAuthors) return;
		syncedAuthors = key;
		mapping = mappingOf(imp.authors);
	});

	// Move on from leftovers of one state when another takes over.
	$effect(() => {
		void view;
		confirming = null;
		actionError = null;
		saveError = null;
	});

	function chooseZip() {
		zipInput?.click();
	}

	async function onZipChosen(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file || serverId == null || !limits) return;

		fileError = null;
		pendingFile = null;
		serverImportState.clearError(serverId);
		const problem = fileProblem(file, limits, formatBytes);
		if (problem) {
			fileError = problem;
			return;
		}
		if (view === 'interrupted') {
			if (imp && isSameUpload(imp, file)) await serverImportState.resumeWith(serverId, file);
			else pendingFile = file;
			return;
		}
		await serverImportState.upload(serverId, file);
	}

	async function startOver() {
		const file = pendingFile;
		pendingFile = null;
		if (file && serverId != null) await serverImportState.upload(serverId, file);
	}

	async function run(
		key: NonNullable<typeof busy>,
		failure: string,
		work: () => Promise<unknown>,
		setError: (message: string | null) => void = (message) => (actionError = message)
	): Promise<boolean> {
		if (busy) return false;
		busy = key;
		setError(null);
		try {
			await work();
			return true;
		} catch (e) {
			const message = `${failure}: ${getErrorMessage(e)}`;
			setError(message);
			toast.error(message);
			return false;
		} finally {
			busy = null;
		}
	}

	async function begin() {
		const id = serverId;
		if (id == null || !imp) return;
		const dirty = mappingChanged(imp.authors, mapping);
		await run('start', "Couldn't start the import", async () => {
			if (dirty) await serverImportState.saveAuthors(id, mapping);
			await serverImportState.start(id);
		});
	}

	async function retry() {
		const id = serverId;
		if (id != null)
			await run('retry', "Couldn't restart the import", () => serverImportState.start(id));
	}

	async function saveAuthors() {
		const id = serverId;
		if (id == null) return;
		await run(
			'save',
			"Couldn't save the authors",
			() => serverImportState.saveAuthors(id, mapping),
			(message) => (saveError = message)
		);
	}

	async function discard() {
		const id = serverId;
		if (id == null) return;
		if (await run('discard', "Couldn't remove the import", () => serverImportState.discard(id))) {
			confirming = null;
		}
	}

	async function cancelUpload() {
		const id = serverId;
		if (id == null) return;
		await run('cancel', "Couldn't cancel the upload", () => serverImportState.cancel(id));
	}

	const diskShort = $derived(
		imp?.plan != null && imp.plan.totals.attachment_bytes > imp.plan.free_bytes
	);
</script>

<input
	bind:this={zipInput}
	type="file"
	accept=".zip,application/zip"
	class="hidden"
	tabindex="-1"
	aria-hidden="true"
	onchange={onZipChosen}
/>

{#snippet chooseZipButton(label: string, variant: 'default' | 'secondary' = 'secondary')}
	<Button {variant} onclick={chooseZip}>{label}</Button>
{/snippet}

{#snippet uploadErrors()}
	{#if fileError ?? entry?.error}
		<p role="alert" class="text-xs text-destructive">{fileError ?? entry?.error}</p>
	{/if}
{/snippet}

{#snippet actionErrorLine()}
	{#if actionError}
		<p role="alert" class="text-xs text-destructive">{actionError}</p>
	{/if}
{/snippet}

{#snippet progress(label: string, value: number, max: number)}
	<ServerImportProgress {label} {value} {max} />
{/snippet}

{#snippet inlineConfirm(prompt: string, label: string, kind: 'discard' | 'remove')}
	{#if confirming === kind}
		<div class="flex flex-wrap items-center gap-2">
			<p class="text-[13px] text-muted-foreground">{prompt}</p>
			<Button class={destructiveOutline} disabled={busy === 'discard'} onclick={discard}>
				{busy === 'discard' ? 'Removing…' : label}
			</Button>
			<Button variant="ghost" disabled={busy === 'discard'} onclick={() => (confirming = null)}>
				Cancel
			</Button>
		</div>
	{/if}
{/snippet}

{#snippet notImported(plan: Plan)}
	{@const lines = notImportedLines(plan)}
	{#if lines.length > 0}
		<section aria-labelledby="import-left-out" class="flex flex-col gap-2">
			<h3 id="import-left-out" class="text-sm font-semibold">Not imported</h3>
			<ul class="flex flex-col gap-1 text-[13px] text-muted-foreground">
				{#each lines as line (line)}
					<li>{line}</li>
				{/each}
			</ul>
		</section>
	{/if}
	{#if plan.warnings.length > 0}
		<section aria-labelledby="import-warnings" class="flex flex-col gap-2">
			<h3 id="import-warnings" class="text-sm font-semibold">Warnings</h3>
			<ul class="flex flex-col gap-1 text-[13px] text-muted-foreground">
				{#each plan.warnings as warning, i (i)}
					<li>{warning}</li>
				{/each}
			</ul>
		</section>
	{/if}
{/snippet}

{#snippet authorsSection(actionLabel: string, alwaysShowAction: boolean)}
	{#if imp && imp.authors.length > 0}
		<ServerImportAuthors
			authors={imp.authors}
			bind:mapping
			{members}
			{membersFailed}
			onretry={loadMembers}
			{actionLabel}
			{alwaysShowAction}
			busy={busy === 'save'}
			error={saveError}
			onaction={saveAuthors}
		/>
	{/if}
{/snippet}

<div class="flex max-w-2xl flex-col gap-6" in:fade={{ duration: 150 }}>
	{#if view === 'loading'}
		<LoadingList rows={3} />
	{:else if view === 'error'}
		<ErrorState
			title="Couldn’t load the import"
			description={entry?.loadError ?? 'There was a problem reaching the server.'}
			onRetry={() => serverId != null && serverImportState.load(serverId)}
		/>
	{:else if view === 'off'}
		<p class="text-sm text-muted-foreground">Imports are turned off on this server.</p>
	{:else if view === 'empty'}
		<div class="flex flex-col gap-3">
			<p class="text-sm text-muted-foreground">
				Import the history of a Discord server: its channels, messages, forum posts and attachments.
				Run the exporter on your own computer, then upload the zip it writes here. Nothing is
				imported until you've reviewed it.
			</p>
			<p class="text-sm">
				<a
					href={EXPORTER_URL}
					target="_blank"
					rel="noopener noreferrer"
					class="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					How to export
				</a>
			</p>
		</div>
		<div class="flex flex-col items-start gap-2">
			{@render chooseZipButton('Choose zip', 'default')}
			{#if limits}
				<p class="text-xs text-text-subtle">Up to {formatBytes(limits.max_bytes)}</p>
			{/if}
			{@render uploadErrors()}
		</div>
	{:else if (view === 'sending' || view === 'paused') && upload}
		<section aria-label="Upload" class="flex flex-col gap-3">
			<p class="truncate text-sm font-medium">{upload.filename}</p>
			{@render progress(`Uploading ${upload.filename}`, upload.received, upload.size)}
			<p aria-live="polite" class="font-mono text-xs text-text-subtle">
				{formatBytes(upload.received)} of {formatBytes(upload.size)} ({percent(
					upload.received,
					upload.size
				)}%)
			</p>
			{#if view === 'paused'}
				<p role="alert" class="text-xs text-destructive">
					The upload paused: {upload.error ?? 'the connection was lost.'}
				</p>
			{:else if upload.error}
				<p aria-live="polite" class="text-xs text-text-subtle">
					Trouble reaching the server. Trying again…
				</p>
			{/if}
			{@render actionErrorLine()}
			<div class="flex items-center gap-2">
				{#if view === 'paused'}
					<Button onclick={() => serverId != null && serverImportState.resume(serverId)}>
						Resume
					</Button>
				{/if}
				<Button variant="secondary" disabled={busy === 'cancel'} onclick={cancelUpload}>
					Cancel
				</Button>
			</div>
		</section>
	{:else if view === 'interrupted' && imp}
		<section aria-label="Interrupted upload" class="flex flex-col gap-3">
			<p aria-live="polite" class="text-sm">
				The upload of <span class="font-medium">{imp.filename}</span> stopped at {formatBytes(
					imp.received
				)} of {formatBytes(imp.size)}. Choose the same file to continue.
			</p>
			{#if pendingFile}
				<div class="flex flex-wrap items-center gap-2">
					<p class="text-[13px] text-muted-foreground">
						{pendingFile.name} isn't the file this upload was started with. Start over with it?
					</p>
					<Button onclick={startOver}>Start over</Button>
					<Button variant="ghost" onclick={() => (pendingFile = null)}>Cancel</Button>
				</div>
			{/if}
			{@render uploadErrors()}
			<div class="flex flex-wrap items-center gap-2">
				{@render chooseZipButton('Choose file', 'default')}
				<Button
					variant="secondary"
					disabled={busy === 'discard'}
					onclick={() => (confirming = 'discard')}
				>
					Discard
				</Button>
			</div>
			{@render inlineConfirm('Remove this upload?', 'Discard', 'discard')}
			{@render actionErrorLine()}
		</section>
	{:else if view === 'unpacking' && imp}
		{@const p = imp.progress}
		<section aria-label="Unpacking" class="flex flex-col gap-3">
			<p class="truncate text-sm font-medium">{imp.filename}</p>
			{#if p?.phase === 'queued'}
				<p aria-live="polite" class="text-sm text-muted-foreground">
					Waiting for another import to finish…
				</p>
			{:else if p?.phase === 'checking'}
				<p aria-live="polite" class="text-sm text-muted-foreground">Checking what's inside…</p>
				<p aria-live="polite" class="font-mono text-xs text-text-subtle">
					{count(p.done, 'message')} so far
				</p>
			{:else}
				<p aria-live="polite" class="text-sm text-muted-foreground">Unpacking…</p>
				{@render progress('Unpacking', p?.done ?? 0, p?.total ?? 0)}
				{#if p && p.total > 0}
					<p class="font-mono text-xs text-text-subtle">
						{formatBytes(p.done)} of {formatBytes(p.total)}
					</p>
				{/if}
			{/if}
		</section>
	{:else if view === 'importing' && imp}
		{@const p = imp.progress}
		<section aria-label="Importing" class="flex flex-col gap-3">
			{#if p?.phase === 'queued'}
				<p aria-live="polite" class="text-sm text-muted-foreground">
					Waiting for another import to finish…
				</p>
			{:else if p?.phase === 'authors'}
				<p aria-live="polite" class="text-sm text-muted-foreground">Updating authors…</p>
				{@render progress('Updating authors', p.done, p.total)}
			{:else}
				<p aria-live="polite" class="text-sm text-muted-foreground">
					Importing… {p ? `${p.done.toLocaleString('en')} of ${count(p.total, 'message')}` : ''}
				</p>
				{@render progress('Importing', p?.done ?? 0, p?.total ?? 0)}
				{#if p?.label}
					<p class="truncate text-xs text-text-subtle">{p.label}</p>
				{/if}
			{/if}
			<p class="text-xs text-text-subtle">You can close this. It keeps running on the server.</p>
		</section>
	{:else if view === 'ready' && imp?.plan}
		{@const plan = imp.plan}
		{@const existing = existingLine(plan.totals.existing_messages)}
		<section aria-label="Review" class="flex flex-col gap-1">
			<h3 class="text-sm font-semibold">
				{imp.source?.server_name ?? 'Import'}{imp.source
					? `, from ${platformName(imp.source)}`
					: ''}
			</h3>
			<p class="truncate font-mono text-[11px] text-text-subtle">{imp.filename}</p>
		</section>

		<div class="flex flex-col gap-1">
			<p class="text-sm">{totalsLine(plan.totals, formatBytes)}</p>
			{#if existing}
				<p class="text-[13px] text-muted-foreground">{existing}</p>
			{/if}
		</div>

		{#if diskShort}
			<p
				class="rounded-xl border border-destructive-border p-4 text-[13px] text-destructive"
				role="alert"
			>
				The attachments need {formatBytes(plan.totals.attachment_bytes)}, the server has {formatBytes(
					plan.free_bytes
				)} free.
			</p>
		{/if}

		<section aria-labelledby="import-channels" class="flex flex-col gap-2">
			<div class="flex items-baseline justify-between gap-3">
				<h3 id="import-channels" class="text-sm font-semibold">Channels</h3>
				<span class="font-mono text-[11px] text-text-subtle">{plan.channels.length}</span>
			</div>
			<ul aria-label="Channels" class="flex flex-col">
				{#each plan.channels as channel (channel.source_id)}
					{@const counts = channelCounts(channel)}
					<li class="rounded-lg px-3 py-2 hover:bg-card">
						<div class="flex items-baseline justify-between gap-3">
							<span class="min-w-0 truncate text-sm">
								{channel.name}
								<span class="ml-1 text-xs text-text-subtle">{channel.type}</span>
							</span>
							{#if counts}
								<span class="shrink-0 font-mono text-[11px] text-text-subtle">{counts}</span>
							{/if}
						</div>
						<p
							class="truncate text-xs {channel.action === 'skipped'
								? 'text-text-subtle'
								: 'text-muted-foreground'}"
						>
							{channelAction(channel)}{channel.category ? ` · ${channel.category}` : ''}
						</p>
					</li>
				{/each}
			</ul>
		</section>

		{@render notImported(plan)}
		{@render authorsSection('Save', false)}

		<div class="flex flex-col gap-2">
			{@render actionErrorLine()}
			{#if confirming !== 'discard'}
				<div class="flex items-center gap-2">
					<Button disabled={diskShort || busy !== null} onclick={begin}>
						{busy === 'start' ? 'Starting…' : 'Start import'}
					</Button>
					<Button
						variant="secondary"
						disabled={busy !== null}
						onclick={() => (confirming = 'discard')}
					>
						Discard
					</Button>
				</div>
			{/if}
			{@render inlineConfirm(
				'Discard this import? The uploaded file is removed.',
				'Discard',
				'discard'
			)}
		</div>
	{:else if view === 'done' && imp}
		{@const result = imp.result ?? imp.plan}
		<section aria-label="Result" class="flex flex-col gap-2">
			{#if result}
				<p aria-live="polite" class="text-sm">
					Imported {count(result.totals.messages, 'message')}, {count(
						result.totals.posts,
						'forum post'
					)} and {count(result.totals.attachments, 'attachment')} from {source}.
				</p>
			{/if}
			{#if imp.error}
				<p role="alert" class="text-[13px] text-destructive">{imp.error}</p>
			{/if}
		</section>

		{#if result}
			{@render notImported(result)}
		{/if}
		{@render authorsSection('Apply', true)}

		<section aria-labelledby="import-newer" class="flex flex-col gap-2">
			<h3 id="import-newer" class="text-sm font-semibold">Upload a newer export</h3>
			<p class="text-[13px] text-muted-foreground">
				Only what's new is added. Messages already here are skipped.
			</p>
			<div class="flex flex-col items-start gap-2">
				{@render chooseZipButton('Choose zip')}
				{@render uploadErrors()}
			</div>
		</section>

		<section aria-labelledby="import-remove" class="flex flex-col gap-2">
			<h3 id="import-remove" class="text-sm font-semibold">Import files</h3>
			<p class="text-[13px] text-muted-foreground">
				Removing the files frees disk space. Imported messages stay, but you can't change their
				authors afterwards without uploading again.
			</p>
			{#if confirming !== 'remove'}
				<div>
					<Button
						variant="ghost"
						class="text-muted-foreground"
						disabled={busy !== null}
						onclick={() => (confirming = 'remove')}
					>
						Remove import files
					</Button>
				</div>
			{/if}
			{@render inlineConfirm('Remove the import files?', 'Remove', 'remove')}
			{@render actionErrorLine()}
		</section>
	{:else if view === 'failed' && imp}
		<section aria-label="Failed" class="flex flex-col gap-2">
			<h3 class="text-sm font-semibold">The import failed</h3>
			<p role="alert" class="text-[13px] text-destructive">
				{imp.error ?? 'Something went wrong.'}
			</p>
		</section>
		{@render uploadErrors()}
		{@render actionErrorLine()}
		{#if confirming !== 'discard'}
			<div class="flex flex-wrap items-center gap-2">
				{#if imp.failed_step === 'importing'}
					<Button disabled={busy !== null} onclick={retry}>
						{busy === 'retry' ? 'Starting…' : 'Retry'}
					</Button>
				{/if}
				{@render chooseZipButton('Choose zip')}
				<Button
					variant="secondary"
					disabled={busy !== null}
					onclick={() => (confirming = 'discard')}
				>
					Discard
				</Button>
			</div>
		{/if}
		{@render inlineConfirm(
			'Discard this import? The uploaded file is removed.',
			'Discard',
			'discard'
		)}
	{:else}
		<LoadingList rows={3} />
	{/if}
</div>
