<script lang="ts">
	import { onMount } from 'svelte';
	import { callsState } from '$lib/states/callsState.svelte';
	import IncomingCallBanner from './IncomingCallBanner.svelte';

	onMount(() => callsState.follow());
</script>

<IncomingCallBanner />
