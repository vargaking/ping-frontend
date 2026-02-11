<script lang="ts">
	import { page } from '$app/state';
	import { serversState } from '$lib/states/serversState.svelte';

	$effect(() => {
		if (page.params.serverId) {
			const serverId = parseInt(page.params.serverId);

			// This re-runs when serversState.servers changes (e.g. after fetchUserServers resolves)
			serversState.setSelectedServerById(serverId);
			serversState.fetchServerChannels(serverId);
		}
	});

	let { children } = $props();
</script>

{@render children()}
