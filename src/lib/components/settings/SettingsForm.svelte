<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from '$lib/components/ui/button/button.svelte';

	type Props = {
		dirty: boolean;
		saving: boolean;
		onsave: () => void | Promise<void>;
		onreset: () => void;
		children: Snippet;
	};

	let { dirty, saving, onsave, onreset, children }: Props = $props();

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (dirty && !saving) onsave();
	}
</script>

<!-- Nothing here auto-saves: the footer stays disabled until the form is dirty. -->
<form class="flex min-h-0 flex-1 flex-col" onsubmit={submit} novalidate>
	<div class="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-7 scrollbar-stable">
		{@render children()}
	</div>

	<footer class="flex h-[68px] shrink-0 items-center gap-3 border-t border-border bg-sidebar px-7">
		<p class="text-[13px] text-muted-foreground" role="status">
			{dirty ? 'Unsaved changes' : ''}
		</p>
		<div class="ml-auto flex items-center gap-2">
			<Button variant="ghost" disabled={!dirty || saving} onclick={onreset}>Reset</Button>
			<Button type="submit" disabled={!dirty || saving} class="min-w-20 font-semibold">
				{saving ? 'Saving…' : 'Save'}
			</Button>
		</div>
	</footer>
</form>
