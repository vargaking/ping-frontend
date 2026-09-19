<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import { TriangleAlert } from 'lucide-svelte';

	type Props = {
		title?: string;
		description?: string;
		onRetry?: () => void;
	};

	let {
		title = 'Something went wrong',
		description = 'We couldn’t load this. Please try again.',
		onRetry
	}: Props = $props();
</script>

<div
	class="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive-border px-6 py-10 text-center"
	role="alert"
>
	<div
		class="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive"
	>
		<TriangleAlert size={20} strokeWidth={1.75} />
	</div>
	<div class="flex flex-col gap-1">
		<p class="text-[15px] font-semibold text-foreground">{title}</p>
		<p class="max-w-xs text-[13px] text-text-subtle">{description}</p>
	</div>
	{#if onRetry}
		<Button variant="secondary" size="sm" onclick={onRetry} class="mt-1">Try again</Button>
	{/if}
</div>
