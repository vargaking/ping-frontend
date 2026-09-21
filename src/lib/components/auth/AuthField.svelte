<script lang="ts">
	import Input from '$lib/components/ui/input/input.svelte';
	import * as Field from '$lib/components/ui/field/index';
	import type { FullAutoFill } from 'svelte/elements';

	let {
		id,
		label,
		type = 'text',
		value = $bindable(''),
		error = null,
		invalid = false,
		hint,
		autocomplete,
		placeholder,
		disabled = false,
		onblur,
		oninput
	}: {
		id: string;
		label: string;
		type?: 'text' | 'password';
		value?: string;
		/** Message to show under the field; also puts the field in the error state. */
		error?: string | null;
		/** Force the error border without a message (e.g. a form-level credential error). */
		invalid?: boolean;
		/** Muted helper text shown under the field while there's no error. */
		hint?: string;
		autocomplete?: FullAutoFill;
		placeholder?: string;
		disabled?: boolean;
		onblur?: () => void;
		oninput?: () => void;
	} = $props();

	const errorId = $derived(`${id}-error`);
	const showInvalid = $derived(!!error || invalid);
</script>

<div class="flex flex-col gap-1.5">
	<label for={id} class="text-[13px] font-medium text-text-label">{label}</label>
	<Input
		{id}
		{type}
		{placeholder}
		{disabled}
		{autocomplete}
		{onblur}
		{oninput}
		bind:value
		aria-invalid={showInvalid ? 'true' : undefined}
		aria-describedby={error ? errorId : undefined}
		class="h-11 rounded-[10px] border-input bg-surface-input px-3 text-sm text-foreground aria-invalid:border-destructive-border aria-invalid:ring-0"
	/>
	{#if error}
		<Field.Error id={errorId} class="text-[13px]" errors={[{ message: error }]} />
	{:else if hint}
		<p class="text-[13px] text-muted-foreground">{hint}</p>
	{/if}
</div>
