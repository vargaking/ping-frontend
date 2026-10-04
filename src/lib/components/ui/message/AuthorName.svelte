<script lang="ts">
	let {
		name,
		imported = false,
		color = null
	}: { name: string; imported?: boolean; color?: string | null } = $props();
</script>

<span class="min-w-0 truncate" style:color>{name}</span>
{#if imported}
	<span
		class="shrink-0 rounded border border-border px-1 text-[10px] leading-4 font-medium text-text-subtle"
	>
		Imported
	</span>
{/if}
