<script lang="ts">
	import { serversState } from '$lib/states/serversState.svelte';

	let channelName = $state(serversState.selectedChannel?.name || '');
</script>

<div class="flex flex-col gap-6">
	<h2 class="text-xl font-bold">Channel Settings</h2>

	{#if serversState.selectedChannel}
		<div class="flex max-w-md flex-col gap-4">
			<div class="flex flex-col gap-1">
				<label for="channel-name" class="text-xs font-bold text-muted-foreground uppercase">
					Channel Name
				</label>
				<input
					id="channel-name"
					type="text"
					bind:value={channelName}
					class="rounded border border-transparent bg-surface-input p-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>

			<button
				class="rounded bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
			>
				Save Changes
			</button>
		</div>
	{:else}
		<p>No channel selected.</p>
	{/if}
</div>
