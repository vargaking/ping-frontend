<script lang="ts">
	import { CurrentChannelStore } from '$lib/stores/userStore';

	let channelName = $CurrentChannelStore?.name || '';
</script>

<div class="flex flex-col gap-6">
	<h2 class="text-xl font-bold">Channel Settings</h2>

	{#if $CurrentChannelStore}
		<div class="flex max-w-md flex-col gap-4">
			<div class="flex flex-col gap-1">
				<label class="text-xs font-bold text-gray-400 uppercase">Channel Name</label>
				<input
					type="text"
					bind:value={channelName}
					class="rounded border border-transparent bg-[#1e1e1e] p-2 text-white outline-none focus:border-blue-500"
				/>
			</div>

			<button
				class="rounded bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
			>
				Save Changes
			</button>
		</div>
	{:else}
		<p>No channel selected.</p>
	{/if}
</div>
