<script lang="ts" module>
	const COLUMNS = 'grid-cols-[88px_1fr_72px_112px_72px_72px]';
	const COPIED_MS = 2000;
	const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

	function codeOf(invite: InviteResponse): string {
		return invite.id.slice(0, 8);
	}

	function expiresIn(validUntil: string | null): string {
		if (!validUntil) return 'Never';
		const minutes = Math.round((new Date(validUntil).getTime() - Date.now()) / 60_000);
		const abs = Math.abs(minutes);
		if (abs < 60) return relativeFormat.format(minutes, 'minute');
		if (abs < 60 * 24) return relativeFormat.format(Math.round(minutes / 60), 'hour');
		return relativeFormat.format(Math.round(minutes / (60 * 24)), 'day');
	}
</script>

<script lang="ts">
	import { fade } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { listServerInvites, deleteInvite } from '$lib/requests/invites';
	import { getErrorMessage } from '$lib/requests/errors';
	import type { InviteResponse } from '$lib/types/invite.types';
	import { inviteLink, isInviteActive } from '$lib/utils/inviteCode';
	import InviteDialog from '$lib/components/servers/InviteDialog.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Button from '$lib/components/ui/button/button.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import { Check, ChevronDown, Copy, Ticket, X } from 'lucide-svelte';

	let invites = $state<InviteResponse[]>([]);
	let isLoading = $state(true);
	let loadError = $state(false);
	let createOpen = $state(false);
	let showExpired = $state(false);
	let revokeTarget = $state<InviteResponse | null>(null);
	let revoking = $state(false);
	let copiedId = $state<string | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	const serverId = $derived(serversState.selectedServer?.id);
	const active = $derived(invites.filter(isInviteActive));
	const expired = $derived(invites.filter((i) => !isInviteActive(i)));

	$effect(() => {
		if (serverId != null) fetchInvites(serverId, true);
	});

	async function fetchInvites(id: number | undefined = serverId, showSkeleton = true) {
		if (id == null) return;
		if (showSkeleton) isLoading = true;
		loadError = false;
		try {
			const fetched = await listServerInvites(id);
			if (id === serverId) invites = fetched;
		} catch (e) {
			console.error('Failed to fetch invites', e);
			loadError = true;
		} finally {
			isLoading = false;
		}
	}

	$effect(() => () => clearTimeout(copiedTimer));

	async function copyLink(invite: InviteResponse) {
		try {
			await navigator.clipboard.writeText(inviteLink(invite.id));
		} catch {
			toast.error("Couldn't copy the link. Select it and copy manually.");
			return;
		}
		copiedId = invite.id;
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copiedId = null), COPIED_MS);
	}

	async function revoke() {
		const target = revokeTarget;
		if (!target || revoking) return;
		revoking = true;
		try {
			await deleteInvite(target.id);
			invites = invites.filter((i) => i.id !== target.id);
			toast.success('Invite revoked');
			revokeTarget = null;
		} catch (e) {
			toast.error(`Couldn't revoke the invite: ${getErrorMessage(e)}`);
		} finally {
			revoking = false;
		}
	}
</script>

{#snippet inviteRow(invite: InviteResponse, dimmed: boolean)}
	<div
		role="row"
		class="grid h-12 {COLUMNS} items-center gap-3 rounded-lg px-3 focus-within:bg-card hover:bg-card {dimmed
			? 'text-text-subtle'
			: ''}"
	>
		<span role="cell" class="font-mono text-xs">
			{#if isInviteActive(invite)}
				<button
					type="button"
					title="Copy invite link"
					class="rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					onclick={() => copyLink(invite)}
				>
					{codeOf(invite)}
				</button>
			{:else}
				{codeOf(invite)}
			{/if}
		</span>
		<span role="cell" class="truncate text-sm">{invite.created_by_username}</span>
		<span role="cell" class="font-mono text-xs">
			{invite.use_count} / {invite.max_uses ?? '∞'}
		</span>
		<span role="cell" class="text-[13px]">{expiresIn(invite.valid_until)}</span>
		<span role="cell" class="text-[13px]">{invite.has_password ? 'Yes' : 'No'}</span>
		<span role="cell" class="flex items-center justify-end">
			{#if isInviteActive(invite)}
				<Button
					variant="ghost"
					size="icon-sm"
					class="rounded-lg text-muted-foreground"
					aria-label="Copy invite link"
					onclick={() => copyLink(invite)}
				>
					{#if copiedId === invite.id}
						<Check size={16} strokeWidth={1.75} />
					{:else}
						<Copy size={16} strokeWidth={1.75} />
					{/if}
				</Button>
			{/if}
			<Button
				variant="ghost"
				size="icon-sm"
				class="rounded-lg text-muted-foreground hover:text-destructive"
				aria-label="Revoke invite {codeOf(invite)}"
				onclick={() => (revokeTarget = invite)}
			>
				<X size={16} strokeWidth={1.75} />
			</Button>
		</span>
	</div>
{/snippet}

<div class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
	<div class="flex items-center justify-between gap-3">
		<p class="text-sm text-muted-foreground">Invite links for this server.</p>
		{#if serversState.canInvite}
			<Button variant="secondary" onclick={() => (createOpen = true)}>Create invite</Button>
		{/if}
	</div>

	{#if isLoading}
		<LoadingList rows={3} />
	{:else if loadError}
		<ErrorState
			title="Couldn’t load invites"
			description="There was a problem reaching the server."
			onRetry={() => fetchInvites()}
		/>
	{:else}
		{#if active.length === 0}
			<EmptyState title="No active invites" description="Create a link to invite people.">
				{#snippet icon()}
					<Ticket size={20} strokeWidth={1.75} />
				{/snippet}
				{#snippet action()}
					{#if serversState.canInvite}
						<Button variant="secondary" onclick={() => (createOpen = true)}>Create invite</Button>
					{/if}
				{/snippet}
			</EmptyState>
		{:else}
			<div role="table" aria-label="Active invites" class="flex flex-col">
				<div
					role="row"
					class="grid {COLUMNS} gap-3 border-b border-border px-3 pb-2 text-xs font-medium tracking-[0.02em] text-text-subtle"
				>
					<span role="columnheader">Code</span>
					<span role="columnheader">Created by</span>
					<span role="columnheader">Uses</span>
					<span role="columnheader">Expires</span>
					<span role="columnheader">Password</span>
					<span role="columnheader"><span class="sr-only">Actions</span></span>
				</div>
				{#each active as invite (invite.id)}
					{@render inviteRow(invite, false)}
				{/each}
			</div>
		{/if}

		{#if expired.length > 0}
			<div class="flex flex-col gap-2">
				<button
					type="button"
					aria-expanded={showExpired}
					aria-controls="expired-invites"
					onclick={() => (showExpired = !showExpired)}
					class="flex w-fit items-center gap-1.5 rounded-md text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<ChevronDown
						size={16}
						strokeWidth={1.75}
						class="transition-transform {showExpired ? '' : '-rotate-90'}"
					/>
					Expired ({expired.length})
				</button>
				{#if showExpired}
					<div id="expired-invites" role="table" aria-label="Expired invites" class="flex flex-col">
						{#each expired as invite (invite.id)}
							{@render inviteRow(invite, true)}
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<InviteDialog bind:open={createOpen} onclose={() => fetchInvites(serverId, false)} />

<Dialog.Root
	open={revokeTarget != null}
	onOpenChange={(open) => {
		if (!open && !revoking) revokeTarget = null;
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Revoke invite {revokeTarget ? codeOf(revokeTarget) : ''}?</Dialog.Title>
			<Dialog.Description>
				The link stops working right away. People who already joined stay in the server.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="secondary" onclick={() => (revokeTarget = null)}>Cancel</Button>
			<Button
				class="border border-destructive-border bg-transparent text-destructive hover:bg-destructive/10"
				disabled={revoking}
				onclick={revoke}
			>
				{revoking ? 'Revoking…' : 'Revoke'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
