<script lang="ts">
	import type { Plan, PrivateSelection, PrivateVisibility } from '$lib/types/serverImport.types';
	import {
		channelAction,
		channelCounts,
		privateChoices,
		setAllPrivate,
		setVisibility,
		togglePrivate,
		withPrivate
	} from '$lib/utils/serverImport';

	type Props = {
		/** The plan as the server made it, with nothing private selected. */
		plan: Plan;
		picks: PrivateSelection;
		disabled?: boolean;
	};

	let { plan, picks = $bindable(), disabled = false }: Props = $props();

	const shown = $derived(withPrivate(plan, picks));
	const choices = $derived(privateChoices(plan));
	const choiceIds = $derived(new Set(choices.map((c) => c.source_id)));
	const selectedCount = $derived(choices.filter((c) => picks[c.source_id]).length);
	const allSelected = $derived(choices.length > 0 && selectedCount === choices.length);

	let selectAll: HTMLInputElement | undefined = $state();
	$effect(() => {
		if (selectAll) selectAll.indeterminate = selectedCount > 0 && !allSelected;
	});

	const visibilities: { value: PrivateVisibility; label: string }[] = [
		{ value: 'only_me', label: 'Only me' },
		{ value: 'everyone', label: 'Everyone' }
	];
</script>

<section aria-labelledby="import-channels" class="flex flex-col gap-2">
	<div class="flex items-baseline justify-between gap-3">
		<h3 id="import-channels" class="text-sm font-semibold">Channels</h3>
		<span class="font-mono text-[11px] text-text-subtle">{plan.channels.length}</span>
	</div>
	{#if choices.length > 0}
		<div class="flex flex-col gap-1 px-3">
			<label class="flex items-center gap-2 text-[13px]">
				<input
					bind:this={selectAll}
					type="checkbox"
					class="size-4 shrink-0 accent-primary"
					checked={allSelected}
					{disabled}
					onchange={(e) => (picks = setAllPrivate(plan, picks, e.currentTarget.checked))}
				/>
				Select all private channels
			</label>
			<p class="text-xs text-text-subtle">
				Private channels are left out unless you tick them. Their roles and member lists aren't
				imported.
			</p>
		</div>
	{/if}
	<ul aria-label="Channels" class="flex flex-col">
		{#each shown.channels as channel (channel.source_id)}
			{@const counts = channelCounts(channel)}
			{@const selectable = choiceIds.has(channel.source_id)}
			{@const ticked = selectable && !!picks[channel.source_id]}
			<li class="rounded-lg px-3 py-2 hover:bg-card">
				<div class="flex items-baseline justify-between gap-3">
					<span class="flex min-w-0 items-baseline gap-2">
						{#if selectable}
							<input
								type="checkbox"
								class="size-4 shrink-0 translate-y-0.5 accent-primary"
								aria-label="Import {channel.name}"
								checked={ticked}
								{disabled}
								onchange={(e) =>
									(picks = togglePrivate(picks, channel.source_id, e.currentTarget.checked))}
							/>
						{/if}
						<span class="min-w-0 truncate text-sm">
							{channel.name}
							<span class="ml-1 text-xs text-text-subtle">{channel.type}</span>
						</span>
					</span>
					{#if counts}
						<span class="shrink-0 font-mono text-[11px] text-text-subtle">{counts}</span>
					{/if}
				</div>
				<p
					class="text-xs break-words {selectable ? 'pl-6' : ''} {channel.action === 'skipped'
						? 'text-text-subtle'
						: 'text-muted-foreground'}"
				>
					{channelAction(channel)}{channel.category ? ` · ${channel.category}` : ''}
				</p>
				{#if ticked && channel.private_action === 'create'}
					<div
						role="radiogroup"
						aria-label="Visible to"
						class="mt-2 ml-6 flex w-fit overflow-hidden rounded-lg border border-input max-md:w-auto max-md:[&>button]:flex-1 {disabled
							? 'opacity-50'
							: ''}"
					>
						{#each visibilities as option (option.value)}
							<button
								type="button"
								role="radio"
								aria-checked={picks[channel.source_id] === option.value}
								{disabled}
								onclick={() => (picks = setVisibility(picks, channel.source_id, option.value))}
								class="h-8 px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed pointer-coarse:h-10 {picks[
									channel.source_id
								] === option.value
									? 'bg-primary text-primary-foreground'
									: 'text-muted-foreground hover:bg-card hover:text-foreground'}"
							>
								{option.label}
							</button>
						{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</section>
