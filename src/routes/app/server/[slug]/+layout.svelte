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
		const serverId = parseInt($page.url.pathname.split('/')[3]);

		if (!serverId) return;

		CurrentServerIdStore.set(serverId);

		getUserChannels(serverId).then((channels) => {
			UserChannelsStore.set(channels);
		});
	});
</script>

<slot />
