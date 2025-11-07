<script lang="ts">
	import UserSVG from '$lib/components/icons/UserSVG.svelte';
	import { getOrFetchUser } from '$lib/stores/userStore';
	import type { MessageType } from '$lib/types/messages.types';
	import { onMount } from 'svelte';

	let message: MessageType = $props();

	let userData = $derived(getOrFetchUser(message.user_id));

	let localTime = $derived(new Date(message.timestamp).toLocaleString());

	onMount(() => {
		console.log('Message component mounted with message:', message.user_id);
	});
</script>

<div class="w-full p-2">
	<span class="mb-2 flex items-center gap-2">
		<div class="h-fit w-fit rounded-xl bg-accent p-2">
			<UserSVG color="white" />
		</div>
		{#await userData then user}
			{#if user}
				<span class="text-base font-bold">{user.username}</span>
			{/if}
		{/await}
		<span class="text-sm text-muted">{localTime}</span>
	</span>

	<div class=" ml-14 max-w-full break-all">
		{message.content}
	</div>
</div>
