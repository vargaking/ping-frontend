<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { voicePresenceState } from '$lib/states/voicePresenceState.svelte';

	const serverId = $derived(page.params.serverId ? parseInt(page.params.serverId) : null);

	$effect(() => {
		const id = serverId;
		if (id == null) return;
		untrack(() => {
			serversState.setSelectedServerId(id);
			serversState.fetchServerChannels(id);
			voicePresenceState.load(id);
		});
	});

	// serverRemoved leaves the server's routes before dropping it, so by the time
	// the server is missing here the path has already moved on.
	$effect(() => {
		const id = serverId;
		if (id == null || !serversState.loaded || serversState.servers[id]) return;
		if (!page.url.pathname.startsWith(`/app/server/${id}`)) return;
		untrack(() => goto('/app/direct/', { replaceState: true }));
	});

	let { children } = $props();
</script>

{#if serverId != null && serversState.servers[serverId]}
	{@render children()}
{/if}
