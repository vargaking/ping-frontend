<script lang="ts">
	import { page } from '$app/state';
	import TopBar from '$lib/components/ui/shell/TopBar.svelte';
	import ServerRail from '$lib/components/ui/shell/ServerRail.svelte';
	import ChannelSidebar from '$lib/components/ui/shell/ChannelSidebar.svelte';
	import DirectSidebar from '$lib/components/ui/shell/DirectSidebar.svelte';
	import Overlay from '$lib/components/ui/Overlay.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';

	let { children } = $props();

	const badgeTotal = $derived(unreadState.badgeTotal);
	const title = $derived(
		badgeTotal > 0 ? `(${badgeTotal > 99 ? '99+' : badgeTotal}) zeta` : 'zeta'
	);

	// The selected server lingers after leaving it, so pick the column by route.
	const inDirect = $derived(page.route.id?.startsWith('/app/direct') ?? false);
</script>

<svelte:head><title>{title}</title></svelte:head>

<div class="flex h-screen w-screen flex-col overflow-hidden">
	<TopBar />
	<div class="flex min-h-0 flex-1">
		<ServerRail />
		{#if inDirect}
			<DirectSidebar />
		{:else if serversState.selectedServer}
			<ChannelSidebar />
		{/if}
		<div class="min-w-0 flex-1">
			{@render children()}
		</div>
	</div>
</div>

<Overlay />
