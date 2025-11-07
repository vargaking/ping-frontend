<script lang="ts">
	import { page } from '$app/stores';
	import { getUserChannels } from '$lib/requests/channels/getUserChannels';
	import { UserChannelsStore } from '$lib/stores/channelsStore';
	import { CurrentServerStore, UserServersStore } from '$lib/stores/userStore';
	import { onMount } from 'svelte';

	onMount(() => {});
</script>
