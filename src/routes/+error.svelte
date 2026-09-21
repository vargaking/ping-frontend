<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Compass, TriangleAlert } from 'lucide-svelte';

	const isNotFound = $derived(page.status === 404);
	const title = $derived(isNotFound ? 'Page not found' : 'Something went wrong');
	const description = $derived(
		isNotFound
			? 'The page you’re looking for doesn’t exist or has moved.'
			: (page.error?.message ?? 'An unexpected error occurred. Please try again.')
	);
</script>

<div class="flex min-h-screen items-center justify-center bg-background p-8">
	<div class="flex max-w-md flex-col items-center gap-4 text-center">
		<div class="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-text-subtle">
			{#if isNotFound}
				<Compass size={26} strokeWidth={1.75} />
			{:else}
				<TriangleAlert size={26} strokeWidth={1.75} class="text-destructive" />
			{/if}
		</div>
		<div class="flex flex-col gap-1.5">
			<p class="font-mono text-[11px] tracking-[0.02em] text-text-subtle">Error {page.status}</p>
			<h1 class="text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
			<p class="text-[15px] leading-relaxed text-text-subtle">{description}</p>
		</div>
		<Button href="/app" class="mt-2">Back to app</Button>
	</div>
</div>
