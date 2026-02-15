<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { getOrFetchUser } from '$lib/stores/userStore';
	import type { MessageType } from '$lib/types/messages.types';
	import { onMount } from 'svelte';

	let message: MessageType = $props();

	// check if user data is already in the usersState,
	// if not, run fetchUser
	let userData = $derived(usersState.getOrFetchUser(message.user_id));

	let localTime = $derived(new Date(message.timestamp).toLocaleString());

	onMount(() => {
		console.log('Message component mounted with message:', message.user_id);
	});
</script>

<div class="w-full p-2">
	<span class="mb-2 flex items-center gap-2">
		{#await userData}
			<Avatar size="md" />
		{:then user}
			<Avatar {user} size="md" />
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
