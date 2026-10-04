<script lang="ts">
	let { name, color }: { name: string; color: string | null } = $props();
</script>

<span
	class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-input px-2 py-[3px] text-xs font-medium text-foreground"
>
	<span
		aria-hidden="true"
		class="h-2 w-2 shrink-0 rounded-full {color ? '' : 'bg-text-subtle'}"
		style:background-color={color}
	></span>
	<span class="truncate">{name}</span>
</span>
