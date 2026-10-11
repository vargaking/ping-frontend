<script lang="ts">
	type Props = {
		rows?: number;
		/** Show a leading circle (avatar) skeleton on each row. */
		avatar?: boolean;
		/** Announced to screen readers. */
		label?: string;
	};

	let { rows = 5, avatar = false, label = 'Loading…' }: Props = $props();
</script>

<div class="flex flex-col gap-3" aria-busy="true" aria-live="polite">
	<span class="sr-only">{label}</span>
	{#each Array.from({ length: rows }, (_, i) => i) as i (i)}
		<div class="flex items-center gap-3">
			{#if avatar}
				<div class="h-9 w-9 shrink-0 rounded-[10px] bg-accent motion-safe:animate-pulse"></div>
			{/if}
			<div class="flex min-w-0 flex-1 flex-col gap-1.5">
				<div
					class="h-3 rounded bg-accent motion-safe:animate-pulse"
					style="width: {60 + ((i * 13) % 30)}%"
				></div>
				<div
					class="h-3 rounded bg-accent motion-safe:animate-pulse"
					style="width: {35 + ((i * 17) % 25)}%"
				></div>
			</div>
		</div>
	{/each}
</div>
