<script lang="ts">
	import { Users } from 'lucide-svelte';
	import { page } from '$app/state';
	import { friendsState } from '$lib/states/friendsState.svelte';
	import { friendsEntryLabel } from '$lib/utils/friends';

	const active = $derived(page.route.id === '/app/direct/friends');
	const requests = $derived(friendsState.incomingCount);
</script>

<a
	href="/app/direct/friends/"
	aria-label={friendsEntryLabel(requests)}
	aria-current={active ? 'page' : undefined}
	class="group flex h-12 w-full shrink-0 items-center gap-2.5 rounded-lg px-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {active
		? 'bg-accent'
		: 'hover:bg-card'}"
>
	<div
		class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-text-label group-hover:bg-background"
		aria-hidden="true"
	>
		<Users size={16} strokeWidth={1.75} />
	</div>
	<span class="min-w-0 flex-1 truncate text-sm text-foreground {active ? 'font-medium' : ''}">
		Friends
	</span>
	{#if requests > 0}
		<span
			class="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-lg bg-primary px-1 font-mono text-[10px] leading-none font-semibold text-primary-foreground"
			aria-hidden="true"
		>
			{requests > 99 ? '99+' : requests}
		</span>
	{/if}
</a>
