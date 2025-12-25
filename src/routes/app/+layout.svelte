<script lang="ts">
	import { PUBLIC_WS_URL } from '$env/static/public';
	import Sidebar from '$lib/components/ui/sidebar/Sidebar.svelte';
	import { SocketStore } from '$lib/stores/socketStore';
	import {
		CurrentChannelStore,
		CurrentServerStore,
		UserServersStore,
		UserStore
	} from '$lib/stores/userStore';
	import { onMount, onDestroy } from 'svelte';

	import Overlay from '$lib/components/ui/Overlay.svelte';

	let { children } = $props();

	onMount(() => {
		return () => {
			// cleanup on destroy
			//$SocketStore.disconnect();
		};
	});
</script>

<div class="flex">
	<Sidebar />

	<div class="h-screen w-full">
		{@render children()}
	</div>
</div>

<Overlay />
