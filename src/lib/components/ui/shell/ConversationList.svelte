<script lang="ts">
	import { page } from '$app/state';
	import { conversationsState } from '$lib/states/conversationsState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import ConversationRow from './ConversationRow.svelte';

	const activeId = $derived(
		page.params.conversationId ? parseInt(page.params.conversationId) : null
	);
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<div class="flex h-[52px] shrink-0 items-center border-b border-border px-4">
		<h2 class="truncate text-[15px] font-semibold">Direct messages</h2>
	</div>

	<div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
		{#if !conversationsState.loaded}
			<div class="px-2">
				<LoadingList rows={4} avatar />
			</div>
		{:else if conversationsState.list.length === 0}
			<p class="px-2 py-1 text-xs text-text-subtle">
				{conversationsState.loadFailed ? 'Couldn’t load conversations.' : 'No conversations yet.'}
			</p>
		{:else}
			{#each conversationsState.list as conversation (conversation.id)}
				<ConversationRow
					{conversation}
					meId={usersState.loggedInUser?.id ?? null}
					active={conversation.id === activeId}
				/>
			{/each}
		{/if}
	</div>
</div>
