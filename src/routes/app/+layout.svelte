<script lang="ts">
	import TopBar from '$lib/components/ui/shell/TopBar.svelte';
	import ServerRail from '$lib/components/ui/shell/ServerRail.svelte';
	import ChannelSidebar from '$lib/components/ui/shell/ChannelSidebar.svelte';
	import Overlay from '$lib/components/ui/Overlay.svelte';
	import { serversState } from '$lib/states/serversState.svelte';

	let { children } = $props();
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden">
	<TopBar />
	<div class="flex min-h-0 flex-1">
		<ServerRail />
		{#if serversState.selectedServer}
			<ChannelSidebar />
		{/if}
		<div class="min-w-0 flex-1">
			{@render children()}
		</div>
	</div>
</div>

<Overlay />
