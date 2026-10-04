<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import { screenPickerState } from '$lib/states/screenPickerState.svelte';
	import { cn } from '$lib/utils';

	type Tab = 'screen' | 'window';

	const sources = $derived(screenPickerState.sources ?? []);
	const screens = $derived(sources.filter((s) => s.kind === 'screen'));
	const windows = $derived(sources.filter((s) => s.kind === 'window'));

	let tab = $state<Tab>('screen');
	let selected = $state<string | null>(null);

	$effect(() => {
		if (!screenPickerState.open) return;
		selected = null;
		tab = screens.length > 0 ? 'screen' : 'window';
	});

	const visible = $derived(tab === 'screen' ? screens : windows);
	const tabs: { id: Tab; label: string }[] = [
		{ id: 'screen', label: 'Screens' },
		{ id: 'window', label: 'Windows' }
	];

	function share(id: string | null = selected) {
		if (id) screenPickerState.choose(id);
	}
</script>

<Dialog.Root
	open={screenPickerState.open}
	onOpenChange={(open) => {
		if (!open) screenPickerState.choose(null);
	}}
>
	<Dialog.Content class="sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>Share your screen</Dialog.Title>
			<Dialog.Description class="sr-only">Choose a screen or window to share.</Dialog.Description>
		</Dialog.Header>

		<div role="tablist" class="inline-flex w-fit gap-1 rounded-lg bg-muted p-1">
			{#each tabs as t (t.id)}
				<button
					type="button"
					role="tab"
					aria-selected={tab === t.id}
					class={cn(
						'rounded-md px-3 py-1 text-sm font-medium transition-colors',
						tab === t.id
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'
					)}
					onclick={() => (tab = t.id)}
				>
					{t.label}
				</button>
			{/each}
		</div>

		<div class="max-h-[60vh] overflow-x-hidden overflow-y-auto" role="tabpanel">
			{#if visible.length === 0}
				<p class="py-10 text-center text-sm text-muted-foreground">Nothing to share here.</p>
			{:else}
				<div class="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3">
					{#each visible as source (source.id)}
						<button
							type="button"
							class={cn(
								'flex min-w-0 flex-col gap-2 rounded-lg p-2 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden',
								selected === source.id && 'ring-2 ring-primary'
							)}
							aria-pressed={selected === source.id}
							title={source.name}
							onclick={() => (selected = source.id)}
							ondblclick={() => share(source.id)}
							onkeydown={(e) => {
								if (e.key !== 'Enter') return;
								e.preventDefault();
								share(source.id);
							}}
						>
							<img
								src={source.thumbnail}
								alt=""
								class="aspect-video w-full rounded-md bg-black/40 object-contain"
							/>
							<span class="flex min-w-0 items-center gap-2 text-sm">
								{#if source.icon}
									<img src={source.icon} alt="" class="size-4 shrink-0" />
								{/if}
								<span class="truncate">{source.name}</span>
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => screenPickerState.choose(null)}>Cancel</Button>
			<Button disabled={!selected} onclick={() => share()}>Share</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
