<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import UpdateDetail from '$lib/components/notifications/UpdateDetail.svelte';
	import { updateState } from '$lib/states/updateState.svelte';

	const reloading = $derived(updateState.phase === 'reloading');
</script>

<div class="flex items-center gap-3 border-b border-border px-4 py-3">
	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span class="text-[13px] font-medium">New version available</span>
		<UpdateDetail />
	</div>
	<Button size="sm" onclick={() => updateState.reload()} disabled={reloading}>
		{reloading ? 'Reloading…' : 'Reload'}
	</Button>
</div>
