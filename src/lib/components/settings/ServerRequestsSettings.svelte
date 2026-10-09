<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { serverRequestState } from '$lib/states/serverRequestState.svelte';
	import { getErrorMessage } from '$lib/requests/errors';
	import Button from '$lib/components/ui/button/button.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import ServerRequestItem from './ServerRequestItem.svelte';

	const current = $derived(serverRequestState.mine?.request ?? null);
	const past = $derived(serverRequestState.past);

	let confirmingWithdraw = $state(false);
	let withdrawing = $state(false);

	onMount(() => {
		void serverRequestState.ensureLoaded();
		void serverRequestState.loadHistory();
	});

	async function withdraw() {
		withdrawing = true;
		try {
			await serverRequestState.withdraw();
			toast.success('Request withdrawn');
		} catch (e) {
			toast.error(`Couldn't withdraw the request: ${getErrorMessage(e)}`);
		} finally {
			withdrawing = false;
			confirmingWithdraw = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	<p class="text-[13px] text-text-subtle">
		Servers are approved by hand while capacity is limited. You'll get a notification when a request
		is decided.
	</p>

	<section class="flex flex-col gap-3" aria-labelledby="current-request-heading">
		<h2 id="current-request-heading" class="text-sm font-medium text-text-label">
			Current request
		</h2>
		{#if !serverRequestState.mine}
			{#if serverRequestState.loadFailed}
				<ErrorState onRetry={() => serverRequestState.load()} />
			{:else}
				<LoadingList rows={2} />
			{/if}
		{:else if current}
			<ul class="flex flex-col">
				<ServerRequestItem request={current}>
					{#snippet actions()}
						{#if current.status === 'pending'}
							<div class="mt-1 flex flex-wrap justify-end gap-2">
								{#if confirmingWithdraw}
									<Button
										variant="secondary"
										size="sm"
										onclick={() => (confirmingWithdraw = false)}
									>
										Keep it
									</Button>
									<Button variant="destructive" size="sm" disabled={withdrawing} onclick={withdraw}>
										{withdrawing ? 'Withdrawing…' : 'Withdraw request'}
									</Button>
								{:else}
									<Button
										variant="secondary"
										size="sm"
										class="border border-input"
										onclick={() => (confirmingWithdraw = true)}
									>
										Withdraw
									</Button>
								{/if}
							</div>
						{/if}
					{/snippet}
				</ServerRequestItem>
			</ul>
			{#if current.status === 'declined'}
				<p class="text-xs text-text-subtle">
					You can send a new request from the + in the server list.
				</p>
			{/if}
		{:else}
			<EmptyState
				title="No request yet"
				description="Use the + in the server list to ask for a server."
				dashed
			/>
		{/if}
	</section>

	<section class="flex flex-col gap-3" aria-labelledby="past-requests-heading">
		<h2 id="past-requests-heading" class="text-sm font-medium text-text-label">Past requests</h2>
		{#if serverRequestState.history === null}
			{#if serverRequestState.historyFailed}
				<div
					class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive-border px-3 py-2 text-[13px] text-foreground"
					role="alert"
				>
					<span>Couldn't load past requests.</span>
					<Button variant="secondary" size="sm" onclick={() => serverRequestState.loadHistory()}>
						Retry
					</Button>
				</div>
			{:else}
				<LoadingList rows={2} />
			{/if}
		{:else if past.length === 0}
			<p class="text-[13px] text-text-subtle">No past requests.</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each past as request (request.id)}
					<ServerRequestItem {request} />
				{/each}
			</ul>
		{/if}
	</section>
</div>
