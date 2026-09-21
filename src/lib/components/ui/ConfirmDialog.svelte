<script lang="ts">
	import { overlayState } from '$lib/states/overlayState.svelte';

	let {
		title,
		description = '',
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		destructive = false,
		onConfirm
	}: {
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		destructive?: boolean;
		onConfirm: () => void | Promise<void>;
	} = $props();

	let busy = $state(false);

	async function confirm() {
		if (busy) return;
		busy = true;
		try {
			await onConfirm();
			overlayState.close();
		} finally {
			busy = false;
		}
	}
</script>

<div class="w-[min(400px,90vw)] bg-background p-6">
	<h2 class="text-base font-semibold text-foreground">{title}</h2>
	{#if description}
		<p class="mt-2 text-sm text-muted-foreground">{description}</p>
	{/if}

	<div class="mt-6 flex justify-end gap-2">
		<button
			type="button"
			onclick={() => overlayState.close()}
			class="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			{cancelLabel}
		</button>
		<button
			type="button"
			onclick={confirm}
			disabled={busy}
			class="rounded-lg px-4 py-2 text-sm font-medium transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 {destructive
				? 'bg-destructive text-white hover:bg-destructive/90'
				: 'bg-primary text-primary-foreground hover:bg-primary/90'}"
		>
			{confirmLabel}
		</button>
	</div>
</div>
