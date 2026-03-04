<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { getOrFetchUser } from '$lib/stores/userStore';
	import type { MessageType } from '$lib/types/messages.types';
	import MessageNode from './MessageNode.svelte';
	import { onMount } from 'svelte';

	let message: MessageType = $props();

	// check if user data is already in the usersState,
	// if not, run fetchUser
	let userData = $derived(usersState.getOrFetchUser(message.user_id));

	let parsedContent = $derived.by(() => {
		if (typeof message.content === 'string') {
			try {
				return JSON.parse(message.content);
			} catch (e) {
				try {
					// Fallback for Python-style stringified dicts (which use single quotes)
					const fixedStr = message.content
						.replace(/'/g, '"')
						.replace(/False/g, 'false')
						.replace(/True/g, 'true')
						.replace(/None/g, 'null');
					return JSON.parse(fixedStr);
				} catch (fallbackError) {
					// It's a legacy string message or parsing still failed
					return message.content;
				}
			}
		}
		return message.content;
	});

	let localTime = $derived(new Date(message.timestamp).toLocaleString());

	onMount(() => {
		console.log('Message component mounted with message:', message.user_id);
	});
</script>

{#await userData then user}
	<div class="flex w-full items-start gap-4 p-2">
		<Avatar {user} size="md" />
		<span class="flex flex-col gap-1">
			<span class="flex items-center gap-2">
				{#if user}
					<span class="text-base font-bold">{user.username}</span>
				{/if}
				<span class="text-sm text-muted">{localTime}</span>
			</span>

			<div
				class="prose prose-sm max-w-full wrap-break-word break-all whitespace-pre-wrap prose-invert"
			>
				<MessageNode node={parsedContent} />
			</div>
		</span>
	</div>
{/await}
