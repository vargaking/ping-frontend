<script lang="ts">
	import { PUBLIC_WS_URL } from '$env/static/public';
	import Sidebar from '$lib/components/ui/sidebar/Sidebar.svelte';
	import { getUserServers } from '$lib/requests/servers/getUserServers';
	import { MessageStore } from '$lib/stores/messageStore';
	import { SocketStore } from '$lib/stores/socketStore';
	import {
		CurrentChannelStore,
		CurrentServerStore,
		UserServersStore,
		UserStore
	} from '$lib/stores/userStore';
	import { onMount, onDestroy } from 'svelte';

	let { children } = $props();

	onMount(() => {
		// start connection when component mounts
		$SocketStore.connect();

		getUserServers().then((servers) => {
			UserServersStore.set(servers);
		});

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
