<script lang="ts">
	import { serversState } from '$lib/states/serversState.svelte';
</script>

<div class="flex flex-col gap-6">
	<div>
		<h2 class="mb-1 text-xl font-bold">Server Members</h2>
		<p class="text-sm text-gray-400">Manage members in this server.</p>
	</div>

	{#if serversState.selectedServer}
		<div class="text-sm text-gray-400 italic">Members management coming soon...</div>
	{:else}
		<p>No server selected.</p>
	{/if}
</div>
