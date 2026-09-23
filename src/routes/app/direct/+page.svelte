<script lang="ts">
	import { goto } from '$app/navigation';
	import { conversationsState } from '$lib/states/conversationsState.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import { MessagesSquare } from 'lucide-svelte';

	// Open the last DM the user had open, else the most recently active one.
	// A remembered conversation that's gone falls back silently.
	$effect(() => {
		if (!conversationsState.loaded) return;

		const lastActive = conversationsState.lastActiveId;
		const remembered = lastActive != null && conversationsState.conversations[lastActive];
		if (lastActive != null && !remembered) conversationsState.setLastActive(null);

		const destination = remembered ? lastActive : conversationsState.list[0]?.id;
		if (destination != null) goto(`/app/direct/${destination}/`, { replaceState: true });
	});
</script>

{#if conversationsState.loaded && conversationsState.list.length === 0}
	<div class="flex h-full items-center justify-center p-8">
		{#if conversationsState.loadFailed}
			<ErrorState
				title="Couldn’t load conversations"
				description="There was a problem reading your direct messages."
				onRetry={() => conversationsState.fetch()}
			/>
		{:else}
			<EmptyState
				title="No conversations yet"
				description="Choose Message on someone in a server’s member list to start one."
			>
				{#snippet icon()}
					<MessagesSquare size={20} strokeWidth={1.75} />
				{/snippet}
			</EmptyState>
		{/if}
	</div>
{/if}
