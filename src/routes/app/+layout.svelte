<script lang="ts">
	import Sidebar from '$lib/components/ui/sidebar/Sidebar.svelte';
	import { onMount } from 'svelte';

	import Overlay from '$lib/components/ui/Overlay.svelte';

	let { children } = $props();

	onMount(() => {
		return () => {
			// cleanup on destroy
			//socketState.disconnect();
		};
	});
</script>

<div class="flex h-screen w-screen">
	<Sidebar />

	<div class="h-full w-full">
		{@render children()}
	</div>
</div>

<Overlay />
