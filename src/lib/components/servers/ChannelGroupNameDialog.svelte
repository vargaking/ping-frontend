<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { getErrorMessage } from '$lib/requests/errors';
	import Input from '$lib/components/ui/input/input.svelte';
	import Button from '$lib/components/ui/button/button.svelte';

	let {
		title,
		confirmLabel,
		initialName = '',
		onSubmit
	}: {
		title: string;
		confirmLabel: string;
		initialName?: string;
		onSubmit: (name: string) => Promise<void>;
	} = $props();

	let name = $state(initialName);
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed || busy) return;
		busy = true;
		try {
			await onSubmit(trimmed);
			overlayState.close();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busy = false;
		}
	}
</script>

<form onsubmit={submit} class="w-[min(400px,90vw)] bg-background p-6">
	<h2 class="text-base font-semibold text-foreground">{title}</h2>
	<Input
		class="mt-4"
		placeholder="Category name"
		aria-label="Category name"
		maxlength={100}
		bind:value={name}
		autofocus
	/>
	<div class="mt-6 flex justify-end gap-2">
		<Button type="button" variant="ghost" onclick={() => overlayState.close()}>Cancel</Button>
		<Button type="submit" disabled={!name.trim() || busy}>{confirmLabel}</Button>
	</div>
</form>
