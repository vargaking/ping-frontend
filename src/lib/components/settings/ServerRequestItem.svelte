<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Check, Clock, Minus, X } from 'lucide-svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import type { ServerRequest, ServerRequestStatus } from '$lib/types/serverRequest.types';
	import { sentOn, STATUS_LABELS } from '$lib/utils/serverRequests';

	let { request, actions }: { request: ServerRequest; actions?: Snippet } = $props();

	const looks: Record<ServerRequestStatus, { icon: typeof Clock; tone: string }> = {
		pending: { icon: Clock, tone: 'text-idle' },
		approved: { icon: Check, tone: 'text-online' },
		declined: { icon: X, tone: 'text-destructive' },
		withdrawn: { icon: Minus, tone: 'text-text-subtle' }
	};

	const look = $derived(looks[request.status]);
	const Icon = $derived(look.icon);
</script>

<li class="flex flex-col gap-2 rounded-xl border border-border p-4" data-status={request.status}>
	<div class="flex items-start justify-between gap-3">
		<span class="min-w-0 text-[15px] font-semibold break-words text-foreground">
			{request.name}
		</span>
		<span class="flex shrink-0 items-center gap-1.5 text-[13px] font-medium {look.tone}">
			<Icon size={14} strokeWidth={2} aria-hidden="true" />
			{STATUS_LABELS[request.status]}
		</span>
	</div>
	<p class="text-xs text-text-subtle">Sent {sentOn(request.created_at)}</p>
	<p class="text-[13px] break-words whitespace-pre-wrap text-muted-foreground">
		{request.description}
	</p>
	{#if request.status === 'declined' && request.decline_reason}
		<p
			class="rounded-lg border border-destructive-border p-3 text-[13px] break-words whitespace-pre-wrap text-foreground"
		>
			<span class="font-medium">Reason:</span>
			{request.decline_reason}
		</p>
	{/if}
	{#if request.status === 'approved' && request.server_id != null}
		<a
			href="/app/server/{request.server_id}/"
			onclick={() => overlayState.close()}
			class="w-fit text-[13px] font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			Open the server
		</a>
	{/if}
	{@render actions?.()}
</li>
