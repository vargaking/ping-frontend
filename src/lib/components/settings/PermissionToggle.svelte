<script lang="ts">
	import type { PermissionState } from '$lib/utils/roles';

	type Props = {
		label: string;
		description: string;
		value: PermissionState;
		/** What an inherited value resolves to, e.g. "Allowed, from Mod". */
		inherited: string;
		disabled?: boolean;
		onchange: (value: PermissionState) => void;
	};

	let { label, description, value, inherited, disabled = false, onchange }: Props = $props();

	const options: { value: PermissionState; label: string }[] = [
		{ value: 'inherit', label: 'Inherit' },
		{ value: 'allow', label: 'Allow' },
		{ value: 'deny', label: 'Deny' }
	];

	const active: Record<PermissionState, string> = {
		inherit: 'bg-accent text-foreground',
		allow: 'bg-primary text-primary-foreground',
		deny: 'bg-destructive text-white'
	};
</script>

<div class="flex items-center justify-between gap-4">
	<div class="flex min-w-0 flex-col gap-1">
		<span class="text-sm font-medium">{label}</span>
		<span class="text-xs text-muted-foreground">{description}</span>
		{#if value === 'inherit'}
			<span class="text-xs text-text-subtle">{inherited}</span>
		{/if}
	</div>
	<div
		role="radiogroup"
		aria-label={label}
		class="flex shrink-0 overflow-hidden rounded-lg border border-input {disabled
			? 'opacity-50'
			: ''}"
	>
		{#each options as option (option.value)}
			<button
				type="button"
				role="radio"
				aria-checked={value === option.value}
				{disabled}
				onclick={() => onchange(option.value)}
				class="h-8 px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed {value ===
				option.value
					? active[option.value]
					: 'text-muted-foreground hover:bg-card hover:text-foreground'}"
			>
				{option.label}
			</button>
		{/each}
	</div>
</div>
