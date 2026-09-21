<script lang="ts">
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import { MessagesSquare } from 'lucide-svelte';
</script>

<div class="flex h-full items-center justify-center p-8">
	<EmptyState
		title="Pick a server to start"
		description="Choose a server from the rail on the left, or add a new one to begin chatting."
	>
		{#snippet icon()}
			<MessagesSquare size={20} strokeWidth={1.75} />
		{/snippet}
	</EmptyState>
</div>
