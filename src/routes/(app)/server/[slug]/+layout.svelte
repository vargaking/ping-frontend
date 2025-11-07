<script lang="ts">
	import { page } from '$app/stores';
	import { getUserChannels } from '$lib/requests/channels/getUserChannels';
	import { UserChannelsStore } from '$lib/stores/channelsStore';
	import {
		CurrentChannelStore,
		CurrentServerIdStore,
		CurrentServerStore,
		UserServersStore
	} from '$lib/stores/userStore';
	import { onMount } from 'svelte';

	onMount(() => {
		if (!$page.params.slug) return;

		const serverId = parseInt($page.params.slug);

		CurrentServerIdStore.set(serverId);

		getUserChannels(serverId).then((channels) => {
			UserChannelsStore.set(channels);
		});

		const unsubscribe = UserServersStore.subscribe((servers) => {
			if (servers.length === 0) return;

			const currentServer = servers.find((server) => server.id === serverId);

			if (!currentServer) {
				console.error('Current server not found');
				return;
			}

			CurrentServerStore.set(currentServer);
		});

		return () => {
			unsubscribe();
		};
	});
</script>

<slot />
