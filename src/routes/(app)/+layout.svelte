<script>
	import Sidebar from '$lib/components/ui/sidebar/Sidebar.svelte';

	let { children } = $props();
</script>

<Sidebar />

{@render children()}
