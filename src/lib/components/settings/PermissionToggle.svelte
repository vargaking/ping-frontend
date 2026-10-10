<script lang="ts">
	import type { PermissionState } from '$lib/utils/roles';

	type Props = {
		label: string;
		description: string;
		value: PermissionState;
		/** What the bit falls back to without this setting, and where that comes from. */
		inherited?: { value: 'allow' | 'deny'; text: string };
		/** A change is on its way to the server. */
		pending?: boolean;
		disabled?: boolean;
		/** Options that can't be picked, e.g. because they would lock the user out. */
		blocked?: PermissionState[];
		/** Why the toggle or an option is unavailable. */
		note?: string;
		onchange: (value: PermissionState) => void;
	};

	let {
		label,
		description,
		value,
		inherited,
		pending = false,
		disabled = false,
		blocked = [],
		note,
		onchange
	}: Props = $props();

	const options: { value: PermissionState; label: string }[] = [
		{ value: 'inherit', label: 'Inherit' },
		{ value: 'allow', label: 'Allow' },
		{ value: 'deny', label: 'Deny' }
	];

	const inheritedLine = $derived.by(() => {
		if (!inherited) return null;
		if (value === 'inherit') return inherited.text;
		if (value === inherited.value) return `Same as inherited: ${inherited.text}`;
		return `Overrides: ${inherited.text}`;
	});

	const active: Record<PermissionState, string> = {
		inherit: 'bg-accent text-foreground',
		allow: 'bg-primary text-primary-foreground',
		deny: 'bg-destructive text-white'
	};
</script>

<div
	class="flex items-center justify-between gap-4 max-md:flex-col max-md:items-stretch max-md:gap-2"
>
	<div class="flex min-w-0 flex-col gap-1">
		<span class="text-sm font-medium">{label}</span>
		<span class="text-xs break-words text-muted-foreground">{description}</span>
		{#if inheritedLine}
			<span class="text-xs break-words text-text-subtle">{inheritedLine}</span>
		{/if}
		{#if note}
			<span class="text-xs break-words text-muted-foreground">{note}</span>
		{/if}
	</div>
	<div
		role="radiogroup"
		aria-label={label}
		aria-busy={pending}
		class="flex shrink-0 overflow-hidden rounded-lg border border-input max-md:w-full {disabled
			? 'opacity-50'
			: ''}"
	>
		{#each options as option (option.value)}
			<button
				type="button"
				role="radio"
				aria-checked={value === option.value}
				disabled={disabled || blocked.includes(option.value)}
				onclick={() => onchange(option.value)}
				class="h-8 px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed max-md:flex-1 pointer-coarse:h-10 {value ===
				option.value
					? active[option.value] + (pending ? ' animate-pulse' : '')
					: 'text-muted-foreground hover:bg-card hover:text-foreground'} {blocked.includes(
					option.value
				) && !disabled
					? 'opacity-50'
					: ''}"
			>
				{option.label}
			</button>
		{/each}
	</div>
</div>
