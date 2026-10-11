<script lang="ts">
	import { TAG_COLORS } from '$lib/utils/forum';

	let {
		selected,
		pick,
		label
	}: { selected: string | null; pick: (color: string) => void; label: string } = $props();
</script>

<div class="flex items-center gap-1" role="group" aria-label={label}>
	{#each TAG_COLORS as color (color)}
		<button
			type="button"
			aria-label={color}
			aria-pressed={selected === color}
			onclick={() => pick(color)}
			style:background-color={color}
			class="h-5 w-5 rounded-full ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-8 pointer-coarse:w-8 {selected ===
			color
				? 'ring-2 ring-foreground'
				: ''}"
		></button>
	{/each}
</div>
