<script lang="ts">
	import { page } from '$app/state';
	import { serversState } from '$lib/states/serversState.svelte';
	import ServerRailItem from './ServerRailItem.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip/index';
	import { MessagesSquare, Plus } from 'lucide-svelte';

	const activeServerId = $derived(page.params.serverId ? parseInt(page.params.serverId) : null);
</script>

<nav
	aria-label="Servers"
	class="flex w-[60px] shrink-0 flex-col items-center gap-2 border-r border-border bg-rail py-2.5"
>
	<Tooltip.Provider>
		<Tooltip.Root delayDuration={0}>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<a
						href="/app/direct"
						aria-label="Direct messages"
						class="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent bg-card text-text-label transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-rail focus-visible:outline-none"
						{...props}
					>
						<MessagesSquare size={18} strokeWidth={1.75} />
					</a>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="right" sideOffset={8}>Direct messages</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>

	<hr class="my-0.5 w-6 border-t border-border" />

	<div class="flex flex-col items-center gap-2">
		{#each serversState.serversList as server (server.id)}
			<ServerRailItem
				name={server.name}
				href={`/app/server/${server.id}/`}
				iconUrl={server.server_profile?.iconUrl ?? null}
				active={server.id === activeServerId}
			/>
		{/each}
	</div>

	<Tooltip.Provider>
		<Tooltip.Root delayDuration={0}>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<a
						href="/app/add-server"
						aria-label="Add a server"
						class="mt-1 flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-border-strong text-text-subtle transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-rail focus-visible:outline-none"
						{...props}
					>
						<Plus size={18} strokeWidth={1.75} />
					</a>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="right" sideOffset={8}>Add a server</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
</nav>
