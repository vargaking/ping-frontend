<script lang="ts">
	import { onMount } from 'svelte';
	import { callsState } from '$lib/states/callsState.svelte';

	onMount(() => callsState.follow());
</script>
