<script lang="ts">
	let { name, imported = false }: { name: string; imported?: boolean } = $props();
</script>

<span class="min-w-0 truncate">{name}</span>
{#if imported}
	<span
		class="shrink-0 rounded border border-border px-1 text-[10px] leading-4 font-medium text-text-subtle"
	>
		Imported
	</span>
{/if}
