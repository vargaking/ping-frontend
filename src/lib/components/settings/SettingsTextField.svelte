<script lang="ts">
	type Props = {
		id: string;
		label: string;
		value: string;
		error?: string;
		hint?: string;
		maxlength?: number;
		placeholder?: string;
		multiline?: boolean;
		oninput?: () => void;
	};

	let {
		id,
		label,
		value = $bindable(),
		error = '',
		hint = '',
		maxlength,
		placeholder,
		multiline = false,
		oninput
	}: Props = $props();

	const describedBy = $derived(
		[error ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined
	);

	const fieldClass =
		'w-full rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive';
</script>

<div class="flex max-w-md flex-col gap-1.5">
	<label for={id} class="text-[13px] font-medium text-text-label">{label}</label>
	{#if multiline}
		<textarea
			{id}
			bind:value
			{maxlength}
			{placeholder}
			rows="3"
			{oninput}
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy}
			class="{fieldClass} resize-none py-2.5"
		></textarea>
	{:else}
		<input
			{id}
			type="text"
			bind:value
			{oninput}
			{maxlength}
			{placeholder}
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy}
			class="{fieldClass} h-11"
		/>
	{/if}
	{#if error}
		<p id="{id}-error" class="text-xs text-destructive">{error}</p>
	{:else if hint}
		<p id="{id}-hint" class="text-xs text-text-subtle">{hint}</p>
	{/if}
</div>
