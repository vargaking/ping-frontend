<script lang="ts">
	import { PUBLIC_BASE_URL } from '$env/static/public';
	import { env } from '$env/dynamic/public';
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

	// Host the connection points at. An empty/relative URL means same-origin, so
	// fall back to the page host.
	function hostOf(url: string): string {
		const fallback = typeof window !== 'undefined' ? window.location.host : '';
		if (!url) return fallback;
		try {
			return new URL(url, typeof window !== 'undefined' ? window.location.origin : undefined).host;
		} catch {
			return url;
		}
	}

	const serverHost = $derived(hostOf(PUBLIC_BASE_URL));
	// Central-auth service, if this instance is configured to use one. Absent in
	// the single-server alpha, in which case the Identity group is hidden.
	const identityHost = $derived(env.PUBLIC_IDENTITY_URL ? hostOf(env.PUBLIC_IDENTITY_URL) : null);
</script>

{#snippet row(name: string, host: string, monogram: string, iconUrl: string | null)}
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
			<span class="truncate font-mono text-[11px] text-text-subtle">{host}</span>
		</div>
		<span class="flex shrink-0 items-center gap-1.5 {chip[state].text}">
			<span class="h-1.5 w-1.5 rounded-full {chip[state].dot}"></span>
			<span class="text-[11px]">{chip[state].label}</span>
		</span>
		<span class="w-12 shrink-0 text-right font-mono text-[11px] text-text-subtle">—</span>
	</div>
{/snippet}

<div class="w-[420px] py-2">
	{#if identityHost}
		<div class="px-4 pt-1 pb-1.5 text-xs font-medium text-text-subtle">Identity</div>
		{@render row(
			usersState.loggedInUser?.username ?? 'You',
			identityHost,
			(usersState.loggedInUser?.username ?? 'Y').charAt(0).toUpperCase(),
			usersState.loggedInUser?.profile?.avatar ?? null
		)}
	{/if}

	<div class="px-4 pt-1 pb-1.5 text-xs font-medium text-text-subtle" class:mt-1={identityHost}>
		Servers
	</div>
	{#each serversState.serversList as server (server.id)}
		{@render row(
			server.name,
			serverHost,
			server.name.charAt(0).toUpperCase(),
			server.server_profile?.iconUrl ?? null
		)}
	{/each}
	{#if serversState.serversList.length === 0}
		<p class="px-4 py-2 text-[13px] text-text-subtle">You haven't joined any servers yet.</p>
	{/if}
</div>
