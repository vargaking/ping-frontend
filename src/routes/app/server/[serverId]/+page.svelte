<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { membersPanelState } from '$lib/states/membersPanelState.svelte';
	import ServerWelcome from '$lib/components/servers/ServerWelcome.svelte';
	import UsersSidebar from '$lib/components/ui/sidebar/UsersSidebar.svelte';

	const serverId = $derived(page.params.serverId ? parseInt(page.params.serverId) : null);

	// Decided once per server when its channels are known, so a settings change
	// made later doesn't pull people out of the welcome screen.
	let landing = $state<{ serverId: number; redirect: boolean } | null>(null);

	$effect(() => {
		const id = serverId;
		if (id == null || serversState.channels[id] == null) return;
		untrack(() => {
			if (landing?.serverId === id) return;
			const defaultId = serversState.servers[id]?.server_settings?.default_channel_id;
			const target = defaultId != null ? serversState.channels[id][defaultId] : null;
			const redirect = target?.type === 'text';
			landing = { serverId: id, redirect };
			if (redirect) goto(`/app/server/${id}/channel/${target.id}/`, { replaceState: true });
		});
	});

	const showWelcome = $derived(landing?.serverId === serverId && !landing.redirect);
</script>

{#if showWelcome}
	<div class="flex h-full min-h-0">
		<div class="min-w-0 flex-1 overflow-y-auto">
			<ServerWelcome />
		</div>
		{#if membersPanelState.open}
			<UsersSidebar />
		{/if}
	</div>
{/if}
