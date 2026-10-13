<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Button from '$lib/components/ui/button/button.svelte';

	type Props = {
		open: boolean;
		title: string;
		description: string;
		actionLabel: string;
		busyLabel: string;
		onconfirm: () => Promise<void>;
	};

	let {
		open = $bindable(),
		title,
		description,
		actionLabel,
		busyLabel,
		onconfirm
	}: Props = $props();

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
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!busy) open = next;
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
			<Button
				class="border border-destructive-border bg-transparent text-destructive hover:bg-destructive/10"
				disabled={busy}
				onclick={confirm}
			>
				{busy ? busyLabel : actionLabel}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
