<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	// Which instance you're signing in to. This is a self-hosted product and
	// people run several instances, so showing the server URL is a feature.
	const host = $derived(page.url.host);
</script>

<div class="flex min-h-screen flex-col bg-background text-foreground">
	<header class="flex items-center justify-between px-5 py-4">
		<span class="font-mono text-sm font-medium">zeta</span>
		<span class="font-mono text-[11px] text-text-subtle">{host}</span>
	</header>

	<main class="flex flex-1 items-center justify-center px-4 py-8">
		<div class="flex w-[340px] max-w-full flex-col gap-6">
			{@render children()}
		</div>
	</main>

	<footer class="px-4 py-6 text-center text-xs text-text-subtle">
		Self-hosted. Your messages live on this server, not ours.
	</footer>
</div>
