<script lang="ts">
	let { label }: { label: string } = $props();
</script>

<div class="flex items-center gap-3 py-2" role="separator" aria-label={label}>
	<span class="h-px flex-1 bg-border"></span>
	<span class="font-mono text-[11px] text-text-subtle">{label}</span>
	<span class="h-px flex-1 bg-border"></span>
</div>
