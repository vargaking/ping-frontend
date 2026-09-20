<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import type { User } from '$lib/types/auth.types';
	import type { MessageType } from '$lib/types/messages.types';
	import MessageRow from './MessageRow.svelte';

	let { userId, messages }: { userId: number; messages: MessageType[] } = $props();

	// Resolve the author without gating the whole row on a promise — the row
	// renders immediately (Avatar shows its placeholder) and fills in when the
	// user resolves, so cached authors never flicker and uncached ones don't
	// blank out the message body.
	let user = $state<User | null>(null);

	$effect(() => {
		let cancelled = false;
		Promise.resolve(usersState.getOrFetchUser(userId)).then((u) => {
			if (!cancelled) user = u;
		});
		return () => {
			cancelled = true;
		};
	});

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
	<Avatar {user} size="md" rounded="rounded-[10px]" className="mt-0.5 h-9 w-9" />
	<div class="flex min-w-0 flex-1 flex-col">
		<div class="flex items-baseline gap-2">
			<span class="text-sm font-semibold text-foreground">
				{user?.username ?? '…'}
			</span>
			<span class="font-mono text-[11px] text-text-subtle">{headerTime}</span>
		</div>
		<div class="mt-0.5 flex flex-col gap-0.5">
			{#each messages as message, i (message.id)}
				<MessageRow {message} showHoverTime={i > 0} />
			{/each}
		</div>
	</div>
</div>
