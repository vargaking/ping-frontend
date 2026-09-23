<script lang="ts">
	import { page } from '$app/state';
	import { serversState } from '$lib/states/serversState.svelte';
	import ServerRailItem from './ServerRailItem.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip/index';
	import { MessagesSquare } from 'lucide-svelte';

	const activeServerId = $derived(page.params.serverId ? parseInt(page.params.serverId) : null);
	const directActive = $derived(page.route.id?.startsWith('/app/direct') ?? false);
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
						href="/app/direct/"
						aria-label="Direct messages"
						aria-current={directActive ? 'page' : undefined}
						class="relative flex h-10 w-10 items-center justify-center rounded-xl border border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-rail focus-visible:outline-none {directActive
							? 'bg-primary/15 text-primary'
							: 'bg-card text-text-label hover:bg-accent hover:text-foreground'}"
						{...props}
					>
						{#if directActive}
							<span
								class="absolute top-1/2 -left-2.5 h-5 w-[3px] -translate-y-1/2 rounded-r-[3px] bg-primary"
							></span>
						{/if}
						<MessagesSquare size={18} strokeWidth={1.75} />
					</a>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="right" sideOffset={8}>Direct messages</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>

	{#if serversState.serversList.length > 0}
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
	{/if}
</nav>
