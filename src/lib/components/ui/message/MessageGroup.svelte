<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import type { MessageType } from '$lib/types/messages.types';
	import MessageRow from './MessageRow.svelte';

	let { userId, messages }: { userId: number; messages: MessageType[] } = $props();

	const user = $derived(usersState.getOrFetchUser(userId));

	const headerTime = $derived(
		messages.length > 0
			? new Date(messages[0].timestamp).toLocaleString([], {
					month: 'short',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})
			: ''
	);
</script>

<div class="flex max-w-[760px] gap-3">
	{#await user then resolved}
		<Avatar user={resolved} size="md" rounded="rounded-[10px]" className="mt-0.5 h-9 w-9" />
		<div class="flex min-w-0 flex-1 flex-col">
			<div class="flex items-baseline gap-2">
				<span class="text-sm font-semibold text-foreground">
					{resolved?.username ?? 'Unknown'}
				</span>
				<span class="font-mono text-[11px] text-text-subtle">{headerTime}</span>
			</div>
			<div class="mt-0.5 flex flex-col gap-0.5">
				{#each messages as message (message.id)}
					<MessageRow {message} />
				{/each}
			</div>
		</div>
	{/await}
</div>
