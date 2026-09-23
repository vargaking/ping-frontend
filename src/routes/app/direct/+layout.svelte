<script lang="ts">
	import { onMount } from 'svelte';
	import { conversationsState } from '$lib/states/conversationsState.svelte';

	let { children } = $props();

	// Refresh on every entry into DMs; live messages keep it current after that.
	onMount(() => {
		conversationsState.fetch();
	});
</script>

{@render children()}
