<script lang="ts">
	import { Reply } from 'lucide-svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import type { ReplyRef } from '$lib/types/messages.types';

	let { reply, onJump }: { reply: ReplyRef; onJump: (messageId: string) => void } = $props();

	const authorId = $derived(reply.deleted ? null : reply.user_id);
	const authorName = $derived(authorId != null ? usersState.users[authorId]?.username : undefined);

	$effect(() => {
		if (authorId != null) usersState.getOrFetchUser(authorId);
	});
</script>

{#if reply.deleted}
	<div class="mb-0.5 flex max-w-[760px] items-center gap-1.5 text-xs text-text-subtle italic">
		<Reply size={16} strokeWidth={1.75} class="shrink-0" />
		<span class="truncate">Original message deleted</span>
	</div>
{:else}
	<button
		type="button"
		onclick={() => onJump(reply.id)}
		class="mb-0.5 flex max-w-[760px] min-w-0 items-center gap-1.5 rounded text-left text-xs text-text-subtle transition-colors hover:text-text-body focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		<Reply size={16} strokeWidth={1.75} class="shrink-0" />
		<span class="truncate">{authorName ?? '…'}: {reply.preview}</span>
	</button>
{/if}
