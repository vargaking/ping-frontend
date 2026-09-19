<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		description?: string;
		icon?: Snippet;
		action?: Snippet;
		/** Dashed "add"-style frame using --border-strong (UI spec §1). */
		dashed?: boolean;
	};

	let { title, description, icon, action, dashed = false }: Props = $props();
</script>

<div
	class="flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-10 text-center {dashed
		? 'border border-dashed border-border-strong'
		: ''}"
>
	{#if icon}
		<div class="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-text-subtle">
			{@render icon()}
		</div>
	{/if}
	<div class="flex flex-col gap-1">
		<p class="text-[15px] font-semibold text-foreground">{title}</p>
		{#if description}
			<p class="max-w-xs text-[13px] text-text-subtle">{description}</p>
		{/if}
	</div>
	{#if action}
		<div class="mt-1">{@render action()}</div>
	{/if}
</div>
