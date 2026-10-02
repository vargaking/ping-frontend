<script lang="ts">
	import * as Popover from '$lib/components/ui/popover/index';
	import ConnectionsPopover from './ConnectionsPopover.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import {
		connectionState,
		serverHost,
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
	const serverName = $derived(serversState.selectedServer?.name ?? 'No server');
</script>

<Popover.Root>
	<Popover.Trigger
		aria-label="Connection status: {labels[status]}"
		class="flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2.5 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		<span class="h-1.5 w-1.5 rounded-full {dots[status]}"></span>
		<span class="max-w-40 truncate text-[13px]">{serverName}</span>
		<span class="font-mono text-[11px] text-text-subtle">{formatRtt(info?.rttMs ?? null)}</span>
	</Popover.Trigger>
	<Popover.Content align="center" sideOffset={8} class="p-0">
		<ConnectionsPopover />
	</Popover.Content>
</Popover.Root>
