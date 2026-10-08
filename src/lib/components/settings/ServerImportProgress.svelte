<script lang="ts">
	import { percent } from '$lib/utils/serverImport';

	type Props = {
		label: string;
		value: number;
		/** Zero or less when the total isn't known yet. */
		max: number;
	};

	let { label, value, max }: Props = $props();

	const known = $derived(max > 0);
</script>

<div
	role="progressbar"
	aria-label={label}
	aria-valuemin={0}
	aria-valuemax={known ? max : undefined}
	aria-valuenow={known ? Math.min(value, max) : undefined}
	class="h-1.5 w-full overflow-hidden rounded-full bg-border"
>
	<div
		class="h-full rounded-full bg-primary transition-[width] {known ? '' : 'w-full animate-pulse'}"
		style:width={known ? `${percent(value, max)}%` : undefined}
	></div>
</div>
