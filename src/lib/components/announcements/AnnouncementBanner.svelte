<script lang="ts">
	import { untrack } from 'svelte';
	import { Info, TriangleAlert, Wrench, X } from 'lucide-svelte';
	import { announcementsState } from '$lib/states/announcementsState.svelte';
	import { resyncState } from '$lib/states/resyncState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import type { AnnouncementLevel } from '$lib/types/announcement.types';

	const LEVELS: Record<AnnouncementLevel, { label: string; tone: string }> = {
		info: { label: 'Info', tone: 'border-border bg-primary/10' },
		maintenance: { label: 'Maintenance', tone: 'border-idle/40 bg-idle/15' },
		incident: { label: 'Incident', tone: 'border-destructive-border bg-destructive/15' }
	};

	const current = $derived(announcementsState.active[0]);
	const others = $derived(announcementsState.active.length - 1);

	// Logging out clears the user, which drops the previous account's announcements.
	$effect(() => {
		const id = usersState.loggedInUser?.id ?? null;
		untrack(() => announcementsState.sync(id));
	});

	$effect(() => {
		if (resyncState.generation === 0) return;
		untrack(() => void announcementsState.refresh());
	});

	let barHeight = $state(0);
	$effect(() => {
		if (!current || barHeight === 0) return;
		const root = document.documentElement;
		root.style.setProperty('--announcement-bar', `${barHeight}px`);
		return () => root.style.removeProperty('--announcement-bar');
	});
</script>

{#if current}
	{@const level = LEVELS[current.level]}
	<div
		bind:offsetHeight={barHeight}
		role={current.level === 'incident' ? 'alert' : 'status'}
		class="flex shrink-0 items-start gap-3 border-b py-2 pr-2 pl-4 text-sm text-foreground {level.tone}"
	>
		<span class="mt-0.5 shrink-0" aria-hidden="true">
			{#if current.level === 'incident'}
				<TriangleAlert size={16} strokeWidth={1.75} />
			{:else if current.level === 'maintenance'}
				<Wrench size={16} strokeWidth={1.75} />
			{:else}
				<Info size={16} strokeWidth={1.75} />
			{/if}
		</span>
		<p class="min-w-0 flex-1 py-1 break-words whitespace-pre-wrap">
			<span class="font-semibold">{level.label}:</span>
			{current.text}
			{#if others > 0}
				<span class="text-text-subtle">(+{others} more)</span>
			{/if}
		</p>
		<button
			type="button"
			aria-label="Dismiss announcement"
			onclick={() => announcementsState.dismiss(current.id)}
			class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11"
		>
			<X size={16} strokeWidth={1.75} />
		</button>
	</div>
{/if}
