<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Button from '$lib/components/ui/button/button.svelte';

	type Props = {
		/** One line on what the action does and that it can't be undone. */
		consequence: string;
		actionLabel: string;
		confirmTitle: string;
		confirmDescription: string;
		onconfirm: () => Promise<void>;
	};

	let { consequence, actionLabel, confirmTitle, confirmDescription, onconfirm }: Props = $props();

	let open = $state(false);
	let busy = $state(false);

	async function confirm() {
		if (busy) return;
		busy = true;
		try {
			await onconfirm();
			open = false;
		} finally {
			busy = false;
		}
	}

	const destructiveOutline =
		'border border-destructive-border bg-transparent text-destructive hover:bg-destructive/10';
</script>

<section
	aria-label="Danger zone"
	class="flex max-w-xl items-center gap-4 rounded-xl border border-destructive-border p-4"
>
	<p class="flex-1 text-[13px] text-muted-foreground">{consequence}</p>
	<Dialog.Root bind:open>
		<Dialog.Trigger>
			{#snippet child({ props })}
				<Button {...props} class={destructiveOutline}>{actionLabel}</Button>
			{/snippet}
		</Dialog.Trigger>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>{confirmTitle}</Dialog.Title>
				<Dialog.Description>{confirmDescription}</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
				<Button class={destructiveOutline} disabled={busy} onclick={confirm}>
					{busy ? 'Deleting…' : actionLabel}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
</section>
