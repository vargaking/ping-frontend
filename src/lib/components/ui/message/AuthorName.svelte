<script lang="ts">
	let {
		name,
		imported = false,
		color = null,
		onclick
	}: {
		name: string;
		imported?: boolean;
		color?: string | null;
		/** Makes the name a button that hands over itself, for anchoring what it opens. */
		onclick?: (anchor: HTMLElement) => void;
	} = $props();
</script>

{#if onclick}
	<button
		type="button"
		aria-haspopup="dialog"
		class="min-w-0 truncate rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		style:color
		onclick={(e) => onclick?.(e.currentTarget)}>{name}</button
	>
{:else}
	<span class="min-w-0 truncate" style:color>{name}</span>
{/if}
{#if imported}
	<span
		class="shrink-0 rounded border border-border px-1 text-[10px] leading-4 font-medium text-text-subtle"
	>
		Imported
	</span>
{/if}
