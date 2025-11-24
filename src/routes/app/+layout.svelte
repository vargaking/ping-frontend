<script lang="ts">
	import { PUBLIC_WS_URL } from '$env/static/public';
	import Sidebar from '$lib/components/ui/sidebar/Sidebar.svelte';
	import { getMessages } from '$lib/requests/auth/getMessages';
	import { getUserServers } from '$lib/requests/servers/getUserServers';
	import { MessageStore } from '$lib/stores/messageStore';
	import { SocketStore } from '$lib/stores/socketStore';
	import {
		CurrentChannelStore,
		CurrentServerStore,
		UserServersStore,
		UserStore
	} from '$lib/stores/userStore';
	import { db } from '$lib/utils/db';
	import { onMount, onDestroy } from 'svelte';

	let { children } = $props();

	onMount(() => {
		// start connection when component mounts
		$SocketStore.connect();

		getUserServers().then((servers) => {
			UserServersStore.set(servers);
		});

		getMessages(localStorage.getItem('last_updated') || '1970-01-01T00:00:00Z').then(
			async (messages) => {
				console.log('Fetched messages:', messages);

				// Save the messages to db (bulkPut will update existing or insert new)
				await db.messages.bulkPut(messages);

				console.log('Messages saved to IndexedDB');
				localStorage.setItem('last_updated', new Date().toISOString());
			}
		);

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
