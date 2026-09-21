<script lang="ts">
	import * as Popover from '$lib/components/ui/popover/index';
	import ConnectionsPopover from './ConnectionsPopover.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { socketState } from '$lib/states/socketState.svelte';

	const dot = $derived(socketState.connected ? 'bg-online' : 'bg-destructive');
	const serverName = $derived(serversState.selectedServer?.name ?? 'No server');
</script>

<Popover.Root>
	<Popover.Trigger
		aria-label="Connection status"
		class="flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2.5 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		<span class="h-1.5 w-1.5 rounded-full {dot}"></span>
		<span class="max-w-40 truncate text-[13px]">{serverName}</span>
		<span class="font-mono text-[11px] text-text-subtle">—</span>
	</Popover.Trigger>
	<Popover.Content align="center" sideOffset={8} class="p-0">
		<ConnectionsPopover />
	</Popover.Content>
</Popover.Root>
