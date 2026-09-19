<script lang="ts">
	import { serversState } from '$lib/states/serversState.svelte';
	import { socketState } from '$lib/states/socketState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';

	type ConnState = 'connected' | 'reconnecting' | 'disconnected';

	const state: ConnState = $derived(socketState.connected ? 'connected' : 'disconnected');

	const chip: Record<ConnState, { label: string; dot: string; text: string }> = {
		connected: { label: 'Connected', dot: 'bg-online', text: 'text-online' },
		reconnecting: { label: 'Reconnecting', dot: 'bg-idle', text: 'text-idle' },
		disconnected: { label: 'Disconnected', dot: 'bg-destructive', text: 'text-destructive' }
	};
</script>

{#snippet row(name: string, subtitle: string, monogram: string, iconUrl: string | null)}
	<div class="flex h-12 items-center gap-3 px-4">
		<span
			class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent text-xs font-semibold"
		>
			{#if iconUrl}
				<img src={iconUrl} alt="" class="h-full w-full object-cover" />
			{:else}
				{monogram}
			{/if}
		</span>
		<div class="flex min-w-0 flex-1 flex-col">
			<span class="truncate text-[13px] font-medium">{name}</span>
			<span class="truncate font-mono text-[11px] text-text-subtle">{subtitle}</span>
		</div>
		<span class="flex shrink-0 items-center gap-1.5 {chip[state].text}">
			<span class="h-1.5 w-1.5 rounded-full {chip[state].dot}"></span>
			<span class="text-[11px]">{chip[state].label}</span>
		</span>
		<span class="w-12 shrink-0 text-right font-mono text-[11px] text-text-subtle">—</span>
	</div>
{/snippet}

<div class="w-[420px] py-2">
	<div class="px-4 pt-1 pb-1.5 text-xs font-medium text-text-subtle">Identity</div>
	{@render row(
		usersState.loggedInUser?.username ?? 'You',
		'Central authentication',
		(usersState.loggedInUser?.username ?? 'Y').charAt(0).toUpperCase(),
		usersState.loggedInUser?.profile?.avatar ?? null
	)}

	<div class="mt-1 px-4 pt-1 pb-1.5 text-xs font-medium text-text-subtle">Servers</div>
	{#each serversState.serversList as server (server.id)}
		{@render row(
			server.name,
			'Messages and voice',
			server.name.charAt(0).toUpperCase(),
			server.server_profile?.iconUrl ?? null
		)}
	{/each}
	{#if serversState.serversList.length === 0}
		<p class="px-4 py-2 text-[13px] text-text-subtle">You haven't joined any servers yet.</p>
	{/if}

	<p class="mt-2 border-t border-border px-4 pt-3 text-xs leading-relaxed text-text-subtle">
		Messages and voice go straight to each server. Central auth only confirms who you are.
	</p>
</div>
