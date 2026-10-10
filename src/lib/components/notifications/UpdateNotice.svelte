<script lang="ts">
	import { RefreshCw } from '@lucide/svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { updateState } from '$lib/states/updateState.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import UpdateDetail from './UpdateDetail.svelte';

	const visible = $derived(updateState.noticeVisible && !voiceState.micPrompt);
	const reloading = $derived(updateState.phase === 'reloading');
</script>

<div
	class="pointer-events-none fixed right-4 bottom-4 z-40 w-80 max-w-[calc(100vw-2rem)] max-md:inset-x-3 max-md:top-(--notice-top) max-md:bottom-auto max-md:w-auto max-md:max-w-none"
	aria-live="polite"
>
	{#if visible}
		<div
			class="pointer-events-auto flex flex-col gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg"
			role="region"
			aria-label="Update"
		>
			<div class="flex items-start gap-3">
				<RefreshCw class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
				<div class="flex flex-col gap-1">
					<span class="text-sm font-medium">New version available</span>
					<UpdateDetail />
				</div>
			</div>
			<div class="flex justify-end gap-2">
				<Button size="sm" variant="ghost" onclick={() => updateState.dismiss()}>Dismiss</Button>
				<Button size="sm" onclick={() => updateState.reload()} disabled={reloading}>
					{reloading ? 'Reloading…' : 'Reload'}
				</Button>
			</div>
		</div>
	{/if}
</div>
