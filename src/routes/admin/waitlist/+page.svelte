<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import { listServerRequests } from '$lib/requests/serverRequests/listServerRequests';
	import { approveServerRequest } from '$lib/requests/serverRequests/approveServerRequest';
	import { declineServerRequest } from '$lib/requests/serverRequests/declineServerRequest';
	import { getErrorMessage } from '$lib/requests/errors';
	import { timeAgo } from '$lib/utils/timeAgo';
	import {
		DECLINE_REASON_MAX,
		EXPECTED_SIZES,
		type AdminServerRequest
	} from '$lib/types/serverRequest.types';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Button from '$lib/components/ui/button/button.svelte';
	import SettingsTextField from '$lib/components/settings/SettingsTextField.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';

	type Filter = 'pending' | 'all';
	const filters: { id: Filter; label: string }[] = [
		{ id: 'pending', label: 'Pending' },
		{ id: 'all', label: 'All' }
	];

	let filter = $state<Filter>('pending');
	let requests = $state<AdminServerRequest[]>([]);
	let loading = $state(true);
	let loadFailed = $state(false);
	let busyId = $state<number | null>(null);
	const expanded = new SvelteSet<number>();

	let declining = $state<AdminServerRequest | null>(null);
	let reason = $state('');

	const sizeLabel = (size: string) => EXPECTED_SIZES.find((s) => s.value === size)?.label ?? size;

	async function load(next: Filter = filter) {
		loading = true;
		loadFailed = false;
		try {
			const result = await listServerRequests(next);
			if (next === filter) requests = result;
		} catch (e) {
			console.warn('Failed to load server requests', e);
			if (next === filter) loadFailed = true;
		} finally {
			if (next === filter) loading = false;
		}
	}

	$effect(() => {
		void load(filter);
	});

	function toggle(id: number) {
		if (!expanded.delete(id)) expanded.add(id);
	}

	/** Pending leaves its list once decided; "All" keeps the row with its new status. */
	function settle(updated: AdminServerRequest) {
		requests =
			filter === 'pending'
				? requests.filter((r) => r.id !== updated.id)
				: requests.map((r) => (r.id === updated.id ? updated : r));
	}

	async function decide(
		request: AdminServerRequest,
		action: () => Promise<AdminServerRequest>,
		failure: string
	) {
		busyId = request.id;
		const before = requests;
		requests = filter === 'pending' ? requests.filter((r) => r.id !== request.id) : requests;
		try {
			settle(await action());
		} catch (e) {
			requests = before;
			toast.error(`${failure}: ${getErrorMessage(e)}`);
			// A 409 means someone else decided it first; show what is current.
			void load();
		} finally {
			busyId = null;
		}
	}

	const approve = (request: AdminServerRequest) =>
		decide(request, () => approveServerRequest(request.id), "Couldn't approve");

	function openDecline(request: AdminServerRequest) {
		declining = request;
		reason = '';
	}

	async function confirmDecline() {
		const request = declining;
		if (!request) return;
		declining = null;
		await decide(request, () => declineServerRequest(request.id, reason), "Couldn't decline");
	}
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-4">
	<div class="flex items-center justify-between gap-4">
		<h2 class="text-lg font-semibold">Server requests</h2>
		<div role="group" aria-label="Status" class="flex gap-1 rounded-lg bg-surface-input p-1">
			{#each filters as f (f.id)}
				<button
					type="button"
					aria-pressed={filter === f.id}
					onclick={() => (filter = f.id)}
					class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {filter ===
					f.id
						? 'bg-accent text-foreground shadow-xs'
						: 'text-text-subtle hover:text-foreground'}"
				>
					{f.label}
				</button>
			{/each}
		</div>
	</div>

	{#if loading}
		<LoadingList rows={4} />
	{:else if loadFailed}
		<ErrorState onRetry={() => load()} />
	{:else if requests.length === 0}
		<EmptyState title={filter === 'pending' ? 'No pending requests' : 'No requests yet'} />
	{:else}
		<div class="overflow-x-auto rounded-xl border border-border">
			<table class="w-full min-w-[720px] text-left text-sm">
				<thead class="border-b border-border text-xs text-text-subtle">
					<tr>
						<th scope="col" class="px-4 py-2.5 font-medium">Requester</th>
						<th scope="col" class="px-4 py-2.5 font-medium">Server</th>
						<th scope="col" class="px-4 py-2.5 font-medium">Description</th>
						<th scope="col" class="px-4 py-2.5 font-medium">Size</th>
						<th scope="col" class="px-4 py-2.5 font-medium">Age</th>
						<th scope="col" class="px-4 py-2.5 text-right font-medium">
							<span class="sr-only">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each requests as request (request.id)}
						<tr class="border-b border-border align-top last:border-b-0">
							<td class="px-4 py-3 font-medium">{request.requester.username}</td>
							<td class="px-4 py-3">{request.name}</td>
							<td class="max-w-sm px-4 py-3">
								<button
									type="button"
									aria-expanded={expanded.has(request.id)}
									title={request.description}
									onclick={() => toggle(request.id)}
									class="text-left break-words whitespace-pre-wrap text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {expanded.has(
										request.id
									)
										? ''
										: 'line-clamp-2'}"
								>
									{request.description}
								</button>
							</td>
							<td class="px-4 py-3 whitespace-nowrap">{sizeLabel(request.expected_size)}</td>
							<td class="px-4 py-3 whitespace-nowrap text-text-subtle">
								{timeAgo(request.created_at)}
							</td>
							<td class="px-4 py-3 text-right whitespace-nowrap">
								{#if request.status === 'pending'}
									<div class="flex justify-end gap-2">
										<Button
											variant="secondary"
											size="sm"
											disabled={busyId === request.id}
											onclick={() => openDecline(request)}
										>
											Decline
										</Button>
										<Button
											size="sm"
											disabled={busyId === request.id}
											onclick={() => approve(request)}
										>
											Approve
										</Button>
									</div>
								{:else}
									<span class="text-text-subtle capitalize">{request.status}</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<Dialog.Root open={declining !== null} onOpenChange={(next) => !next && (declining = null)}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Decline “{declining?.name}”?</Dialog.Title>
			<Dialog.Description>
				{declining?.requester.username} will see your reason, if you give one.
			</Dialog.Description>
		</Dialog.Header>
		<SettingsTextField
			id="decline-reason"
			label="Reason (optional)"
			bind:value={reason}
			maxlength={DECLINE_REASON_MAX}
			multiline
		/>
		<Dialog.Footer>
			<Button variant="secondary" onclick={() => (declining = null)}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDecline}>Decline</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
