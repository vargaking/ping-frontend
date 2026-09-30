<script lang="ts">
	import AddServerDialog, { type AddServerTab } from './AddServerDialog.svelte';
	import Button from '$lib/components/ui/button/button.svelte';

	let open = $state(false);
	let tab = $state<AddServerTab>('create');

	function show(next: AddServerTab) {
		tab = next;
		open = true;
	}
</script>

<div
	class="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-border bg-card p-6 text-center"
>
	<p class="text-[15px] font-semibold text-foreground">You're not in any servers yet</p>
	<div class="flex flex-wrap justify-center gap-2">
		<Button onclick={() => show('create')}>Create a server</Button>
		<Button variant="secondary" class="border border-input" onclick={() => show('join')}>
			Join with an invite
		</Button>
	</div>
</div>

<AddServerDialog bind:open bind:tab />
