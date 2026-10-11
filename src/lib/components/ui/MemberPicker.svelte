<script lang="ts">
	import { untrack } from 'svelte';
	import { Check, ChevronDown, Search } from 'lucide-svelte';
	import * as Popover from '$lib/components/ui/popover/index';
	import { phoneState } from '$lib/states/phoneState.svelte';
	import type { User } from '$lib/types/auth.types';
	import { filterEntries, moveIndex, type PickerEntry } from '$lib/utils/memberPicker';

	type Props = {
		members: User[];
		/** The picked member's id, or the value of one of the fixed options. */
		value: number | null;
		/** Listed above the members, e.g. "Not matched" with a null value. */
		options?: PickerEntry[];
		/** Names the trigger for assistive tech, followed by the current choice. */
		label: string;
		onchange: (value: number | null) => void;
		class?: string;
	};

	let { members, value, options = [], label, onchange, class: className = '' }: Props = $props();

	const uid = $props.id();
	const listId = `${uid}-list`;

	let open = $state(false);
	let query = $state('');
	let active = $state(0);
	let input: HTMLInputElement | undefined = $state();
	let list: HTMLElement | undefined = $state();

	const entries = $derived<PickerEntry[]>([
		...options,
		...members.map((m) => ({ value: m.id, label: m.username }))
	]);
	const selectedLabel = $derived(
		options.find((o) => o.value === value)?.label ??
			members.find((m) => m.id === value)?.username ??
			''
	);
	const result = $derived(open ? filterEntries(entries, query) : { shown: [], hidden: 0 });

	$effect(() => {
		if (!open) {
			query = '';
			return;
		}
		untrack(() => {
			active = Math.max(
				filterEntries(entries, '').shown.findIndex((e) => e.value === value),
				0
			);
		});
	});

	$effect(() => {
		if (!open) return;
		void [active, result.shown];
		list?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
	});

	function choose(entry: PickerEntry | undefined) {
		if (!entry) return;
		open = false;
		onchange(entry.value);
	}

	function handleKeydown(event: KeyboardEvent) {
		const rows = result.shown;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			active = Math.max(moveIndex(active, event.key === 'ArrowDown' ? 1 : -1, rows.length), 0);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			choose(rows[active]);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			open = false;
		}
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		aria-label="{label}: {selectedLabel}"
		class="flex h-9 items-center justify-between gap-2 rounded-[10px] border border-input bg-surface-input px-3 text-left text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background {className}"
	>
		<span class="min-w-0 flex-1 truncate">{selectedLabel}</span>
		<ChevronDown size={16} strokeWidth={1.75} class="shrink-0 text-text-subtle" />
	</Popover.Trigger>
	<Popover.Content
		align="end"
		sideOffset={4}
		class="w-72 max-w-[calc(100vw-1rem)] p-1"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			// Focusing the search field would open the on-screen keyboard over the list.
			if (!phoneState.touch) input?.focus();
		}}
	>
		<label
			class="flex h-9 items-center gap-2 rounded-lg border border-input bg-surface-input px-2.5 focus-within:border-ring"
		>
			<span class="sr-only">Search members</span>
			<Search size={16} strokeWidth={1.75} class="shrink-0 text-text-subtle" />
			<input
				bind:this={input}
				bind:value={query}
				type="text"
				role="combobox"
				aria-expanded="true"
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={result.shown.length > 0 ? `${uid}-${active}` : undefined}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder="Search members"
				oninput={() => (active = 0)}
				onkeydown={handleKeydown}
				class="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-text-subtle focus:ring-0"
			/>
		</label>
		<div
			bind:this={list}
			id={listId}
			role="listbox"
			aria-label={label}
			class="mt-1 max-h-[min(16rem,calc(var(--bits-popover-content-available-height,16rem)_-_3.5rem))] overflow-y-auto"
		>
			{#each result.shown as entry, index (index)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					id="{uid}-{index}"
					role="option"
					tabindex="-1"
					aria-selected={entry.value === value}
					data-active={index === active}
					onclick={() => choose(entry)}
					onpointermove={() => (active = index)}
					class="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm pointer-coarse:min-h-11 {index ===
					active
						? 'bg-accent text-accent-foreground'
						: ''}"
				>
					<span class="min-w-0 flex-1 truncate">{entry.label}</span>
					{#if entry.value === value}
						<Check size={14} strokeWidth={2} class="shrink-0 text-text-subtle" />
					{/if}
				</div>
			{:else}
				<p class="px-2 py-3 text-sm text-text-subtle">No members match “{query.trim()}”.</p>
			{/each}
			{#if result.hidden > 0}
				<p class="px-2 py-2 text-xs text-text-subtle">
					{result.hidden} more. Keep typing to narrow the list.
				</p>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
