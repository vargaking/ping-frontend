<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		label: string;
		description: string;
		checked: boolean;
		disabled?: boolean;
		onclick: () => void;
		/** Extra lines under the description, e.g. why the switch is disabled. */
		children?: Snippet;
	};

	let { label, description, checked, disabled = false, onclick, children }: Props = $props();
</script>

<div class="flex items-start justify-between gap-4">
	<div class="flex min-w-0 flex-col gap-1">
		<span class="text-sm font-medium">{label}</span>
		<span class="text-xs text-muted-foreground">{description}</span>
		{@render children?.()}
	</div>
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label}
		{disabled}
		{onclick}
		class="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 {checked
			? 'bg-primary'
			: 'bg-input'}"
	>
		<span
			class="inline-block h-4 w-4 transform rounded-full bg-background transition-transform {checked
				? 'translate-x-5'
				: 'translate-x-1'}"
		></span>
	</button>
</div>
