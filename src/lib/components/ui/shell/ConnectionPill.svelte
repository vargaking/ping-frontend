<script lang="ts">
	import { page } from '$app/state';
	import * as Popover from '$lib/components/ui/popover/index';
	import ConnectionsPopover from './ConnectionsPopover.svelte';
	import UpdateRow from './UpdateRow.svelte';
	import { phoneState } from '$lib/states/phoneState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { updateState } from '$lib/states/updateState.svelte';
	import {
		connectionState,
		serverHost,
		DM_SERVER_NAME,
		type ConnectionStatus
	} from '$lib/states/connectionState.svelte';
	import { formatRtt } from '$lib/utils/formatRtt';

	const dots: Record<ConnectionStatus, string> = {
		connected: 'bg-online',
		connecting: 'bg-idle',
		reconnecting: 'bg-idle',
		disconnected: 'bg-destructive'
	};
	const labels: Record<ConnectionStatus, string> = {
		connected: 'Connected',
		connecting: 'Connecting',
		reconnecting: 'Reconnecting',
		disconnected: 'Disconnected'
	};

	const info = $derived(connectionState.get(serverHost));
	const status = $derived(info?.status ?? 'connecting');
	// The selected server lingers after leaving it, so DMs are detected by route.
	const inDirect = $derived(page.route.id?.startsWith('/app/direct') ?? false);
	const serverName = $derived(
		inDirect ? DM_SERVER_NAME : (serversState.selectedServer?.name ?? serverHost)
	);
</script>

<Popover.Root>
	<Popover.Trigger
		aria-label="Connection status: {labels[status]}{updateState.available
			? '. New version available'
			: ''}"
		class="relative flex h-8 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		<span class="h-1.5 w-1.5 shrink-0 rounded-full {dots[status]}"></span>
		<span class="max-w-40 truncate text-[13px] max-md:max-w-[5.5rem]">{serverName}</span>
		<span class="shrink-0 translate-y-px font-mono text-[11px] text-text-subtle"
			>{formatRtt(info?.rttMs ?? null)}</span
		>
		{#if updateState.available}
			<span
				class="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-rail"
				aria-hidden="true"
			></span>
		{/if}
	</Popover.Trigger>
	<Popover.Content align={phoneState.phone ? 'center' : 'start'} sideOffset={8} class="p-0">
		{#if updateState.available}<UpdateRow />{/if}
		<ConnectionsPopover />
	</Popover.Content>
</Popover.Root>
