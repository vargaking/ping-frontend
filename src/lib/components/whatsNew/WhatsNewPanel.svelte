<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { X } from 'lucide-svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { announcementsState } from '$lib/states/announcementsState.svelte';
	import { whatsNewState } from '$lib/states/whatsNewState.svelte';
	import { formatEntryDate } from '$lib/utils/whatsNew';
	import { ANNOUNCEMENT_LEVELS } from '$lib/types/announcement.types';

	const entries = whatsNewState.entries.slice(0, 30);
	const levelLabel = (level: string) => ANNOUNCEMENT_LEVELS.find((l) => l.value === level)?.label;

	// Taken before the entries are marked seen, so the panel can still point out what is new.
	const fresh = untrack(
		() => new Set(entries.filter((entry) => whatsNewState.isUnseen(entry)).map((entry) => entry.id))
	);

	onMount(() => void whatsNewState.markAllSeen());
</script>

<div
	data-fullscreen
	class="flex max-h-[min(720px,85vh)] w-[min(560px,90vw)] flex-col rounded-xl border border-input bg-background text-foreground max-md:h-[var(--app-height,100dvh)] max-md:max-h-none max-md:w-screen max-md:rounded-none max-md:border-0 max-md:pt-[env(safe-area-inset-top,0px)] max-md:pr-[env(safe-area-inset-right,0px)] max-md:pb-[var(--safe-bottom)] max-md:pl-[env(safe-area-inset-left,0px)]"
>
	<header
		class="flex h-14 shrink-0 items-center border-b border-border pr-3 pl-5 max-md:h-12 max-md:pr-1.5 max-md:pl-4"
	>
		<h1 class="min-w-0 flex-1 truncate text-[15px] font-semibold">What's new</h1>
		<button
			type="button"
			aria-label="Close what's new"
			onclick={() => overlayState.close()}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11"
		>
			<X size={18} strokeWidth={1.75} />
		</button>
	</header>
	<div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5 scrollbar-stable max-md:p-4">
		{#if announcementsState.listed.length > 0}
			<section class="flex flex-col gap-3" aria-label="Announcements">
				<h2 class="text-base font-semibold">Announcements</h2>
				<ul class="flex flex-col gap-3">
					{#each announcementsState.listed as announcement (announcement.id)}
						<li class="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5">
							<div class="flex items-center gap-2 text-xs text-text-subtle">
								<span class="font-medium">{levelLabel(announcement.level)}</span>
								<time datetime={announcement.created_at}>
									{new Date(announcement.created_at).toLocaleDateString(undefined, {
										day: 'numeric',
										month: 'short',
										year: 'numeric'
									})}
								</time>
								{#if announcement.ended}
									<span class="rounded-full bg-accent px-2 py-0.5 text-[11px] leading-none"
										>Ended</span
									>
								{/if}
							</div>
							<p class="text-sm break-words whitespace-pre-wrap text-muted-foreground">
								{announcement.text}
							</p>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#each entries as entry (entry.id)}
			<article class="flex flex-col gap-2">
				<div class="flex items-center gap-2 text-xs text-text-subtle">
					<time datetime={entry.date}>{formatEntryDate(entry.date)}</time>
					{#if fresh.has(entry.id)}
						<span
							class="rounded-full bg-primary px-2 py-0.5 text-[11px] leading-none font-medium text-primary-foreground"
							>New</span
						>
					{/if}
				</div>
				<h2 class="text-base font-semibold">{entry.title}</h2>
				<ul class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
					{#each entry.bullets as bullet (bullet)}
						<li>{bullet}</li>
					{/each}
				</ul>
				{#if entry.image}
					<img
						src={entry.image.src}
						alt={entry.image.alt}
						loading="lazy"
						class="mt-1 w-full rounded-lg border border-border"
					/>
				{/if}
			</article>
		{/each}
	</div>
</div>
