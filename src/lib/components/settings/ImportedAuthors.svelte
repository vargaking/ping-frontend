<script lang="ts">
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { serversState } from '$lib/states/serversState.svelte';
	import { importedAuthorsState } from '$lib/states/importedAuthorsState.svelte';
	import { getErrorMessage } from '$lib/requests/errors';
	import type { ServerMember } from '$lib/types/server.types';
	import type { AuthorMapping } from '$lib/types/serverImport.types';
	import { mappingOf, platformName } from '$lib/utils/serverImport';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import ImportChanges from './ImportChanges.svelte';
	import ServerImportAuthors from './ServerImportAuthors.svelte';
	import ServerImportProgress from './ServerImportProgress.svelte';

	const serverId = $derived(serversState.selectedServer?.id);
	const entry = $derived(serverId != null ? importedAuthorsState.of(serverId) : null);
	const imp = $derived(entry?.import ?? null);
	const working = $derived(imp?.status === 'importing');

	let members = $state<ServerMember[] | null>(null);
	let membersFailed = $state(false);
	let mapping = $state<AuthorMapping>({});
	let syncedAuthors = '';
	let saving = $state(false);
	let saveError = $state<string | null>(null);

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

	async function apply() {
		const id = serverId;
		if (id == null || saving) return;
		saving = true;
		saveError = null;
		try {
			await importedAuthorsState.save(id, mapping);
		} catch (e) {
			saveError = `Couldn't apply the changes: ${getErrorMessage(e)}`;
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex max-w-2xl flex-col gap-6" in:fade={{ duration: 150 }}>
	{#if imp}
		<p class="text-sm text-muted-foreground">
			Match the authors imported from {imp.source?.server_name ?? 'the export'}{imp.source
				? ` on ${platformName(imp.source)}`
				: ''} to members. A matched member owns those messages and can edit and delete them.
		</p>

		{#if imp.authors.length > 0}
			<ServerImportAuthors
				authors={imp.authors}
				bind:mapping
				{members}
				{membersFailed}
				onretry={loadMembers}
				actionLabel="Apply"
				alwaysShowAction
				busy={saving || working}
				error={saveError}
				onaction={apply}
			/>
		{/if}

		{#if working}
			<section aria-label="Updating authors" class="flex flex-col gap-3">
				{#if imp.progress?.phase === 'queued'}
					<p aria-live="polite" class="text-sm text-muted-foreground">
						Waiting for another import to finish…
					</p>
				{:else}
					<p aria-live="polite" class="text-sm text-muted-foreground">Updating authors…</p>
					<ServerImportProgress
						label="Updating authors"
						value={imp.progress?.done ?? 0}
						max={imp.progress?.total ?? 0}
					/>
				{/if}
			</section>
		{:else if imp.error}
			<p role="alert" class="text-[13px] text-destructive">{imp.error}</p>
		{/if}

		<ImportChanges changes={entry?.changes ?? []} {members} />
	{:else}
		<LoadingList rows={3} />
	{/if}
</div>
