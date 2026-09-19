<script lang="ts">
	type Props = {
		rows?: number;
		/** Show a leading circle (avatar) skeleton on each row. */
		avatar?: boolean;
	};

	let { rows = 5, avatar = false }: Props = $props();
</script>

<div class="flex flex-col gap-3" aria-busy="true" aria-live="polite">
	<span class="sr-only">Loading…</span>
	{#each Array(rows) as _, i (i)}
		<div class="flex items-center gap-3">
			{#if avatar}
				<div class="h-9 w-9 shrink-0 animate-pulse rounded-[10px] bg-accent"></div>
			{/if}
			<div class="flex min-w-0 flex-1 flex-col gap-1.5">
				<div
					class="h-3 animate-pulse rounded bg-accent"
					style="width: {60 + ((i * 13) % 30)}%"
				></div>
				<div
					class="h-3 animate-pulse rounded bg-accent"
					style="width: {35 + ((i * 17) % 25)}%"
				></div>
			</div>
		</div>
	{/each}
</div>
