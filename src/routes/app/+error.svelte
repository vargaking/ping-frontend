<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';

	const isNotFound = $derived(page.status === 404);
</script>

<div class="flex h-full items-center justify-center p-8">
	<ErrorState
		title={isNotFound ? 'Channel not found' : 'Something went wrong'}
		description={isNotFound
			? 'This page doesn’t exist. Pick a channel from the sidebar.'
			: (page.error?.message ?? 'An unexpected error occurred in the app.')}
		onRetry={() => invalidateAll()}
	/>
</div>
