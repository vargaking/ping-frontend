<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import SettingsSwitch from '$lib/components/settings/SettingsSwitch.svelte';
	import ScreenSourceGrid from './ScreenSourceGrid.svelte';
	import { desktop } from '$lib/desktop';
	import { shareDialogState } from '$lib/states/shareDialogState.svelte';
	import { voiceSettingsState } from '$lib/states/voiceSettingsState.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import {
		SCREEN_CONTENT_LABELS,
		SCREEN_PRESETS,
		type ScreenContent,
		type ScreenPresetId
	} from '$lib/utils/screenShare';
	import { soundEnv, soundOption, type Surface } from '$lib/utils/shareSound';
	import { cn } from '$lib/utils';

	const surfaces: { id: Surface; label: string }[] = [
		{ id: 'browser', label: 'Tab' },
		{ id: 'window', label: 'Window' },
		{ id: 'monitor', label: 'Entire screen' }
	];

	const hasGrid = $derived(!!desktop?.listScreenSources);
	const pickOnly = $derived(shareDialogState.pickOnly);
	const systemPicker = $derived(shareDialogState.systemPicker && !pickOnly);
	const chosen = $derived(
		shareDialogState.sources?.find((s) => s.id === shareDialogState.selected) ?? null
	);
	const env = $derived(soundEnv());
	const chooseSurface = $derived(!desktop && env.browser.kind === 'chromium');
	const sound = $derived(soundOption(env, voiceSettingsState.screenSurface));
	const soundOn = $derived(sound.available && voiceSettingsState.screenSound);
	const canShare = $derived(
		!voiceState.startingShare && (!hasGrid || shareDialogState.selected !== null)
	);

	function pick(id: string) {
		shareDialogState.selected = id;
	}

	function shareSource(id: string) {
		if (pickOnly) {
			shareDialogState.choose(id);
			return;
		}
		pick(id);
		void shareDialogState.share();
	}
</script>

{#snippet segmented<T extends string>(
	label: string,
	options: { id: T; label: string }[],
	value: T,
	onchange: (id: T) => void
)}
	<div class="flex flex-col gap-1.5">
		<span class="text-sm font-medium">{label}</span>
		<div role="radiogroup" aria-label={label} class="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
			{#each options as option (option.id)}
				<button
					type="button"
					role="radio"
					aria-checked={value === option.id}
					class={cn(
						'min-w-0 flex-1 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden',
						value === option.id
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'
					)}
					onclick={() => onchange(option.id)}
				>
					{option.label}
				</button>
			{/each}
		</div>
	</div>
{/snippet}

<Dialog.Root
	open={shareDialogState.open}
	onOpenChange={(open) => {
		if (!open && shareDialogState.open) shareDialogState.close();
	}}
>
	<Dialog.Content class="sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>Share your screen</Dialog.Title>
			<Dialog.Description class="sr-only">
				{pickOnly ? 'Choose a screen or window to share.' : 'Choose what to share and how.'}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex min-w-0 flex-col gap-4">
			{#if hasGrid || pickOnly}
				{#if shareDialogState.sources === null}
					<p class="py-10 text-center text-sm text-muted-foreground">Loading…</p>
				{:else if systemPicker}
					{#if chosen}
						<div class="flex flex-col gap-3">
							<img
								src={chosen.thumbnail}
								alt=""
								class="aspect-video max-h-[40vh] w-full rounded-md bg-black/40 object-contain"
							/>
							<div class="flex min-w-0 items-center justify-between gap-3">
								<span class="flex min-w-0 items-center gap-2 text-sm">
									{#if chosen.icon}
										<img src={chosen.icon} alt="" class="size-4 shrink-0" />
									{/if}
									<span class="truncate" title={chosen.name}>{chosen.name}</span>
								</span>
								<Button variant="outline" size="sm" onclick={() => shareDialogState.change()}>
									Change
								</Button>
							</div>
						</div>
					{:else}
						<div class="flex flex-col items-center gap-3 py-10">
							<p class="text-sm text-muted-foreground">Nothing chosen yet</p>
							<Button variant="outline" onclick={() => shareDialogState.change()}>
								Choose what to share
							</Button>
						</div>
					{/if}
				{:else}
					<ScreenSourceGrid
						sources={shareDialogState.sources}
						selected={shareDialogState.selected}
						onselect={pick}
						onshare={shareSource}
					/>
				{/if}
			{/if}

			{#if !pickOnly}
				{#if chooseSurface}
					{@render segmented(
						'What to share',
						surfaces,
						voiceSettingsState.screenSurface,
						(screenSurface) => voiceSettingsState.save({ screenSurface })
					)}
				{/if}
				{@render segmented(
					'Quality',
					Object.entries(SCREEN_PRESETS).map(([id, { label }]) => ({
						id: id as ScreenPresetId,
						label
					})),
					voiceSettingsState.screenPreset,
					(screenPreset) => voiceSettingsState.save({ screenPreset })
				)}
				{@render segmented(
					'Optimize for',
					Object.entries(SCREEN_CONTENT_LABELS).map(([id, label]) => ({
						id: id as ScreenContent,
						label
					})),
					voiceSettingsState.screenContent,
					(screenContent) => voiceSettingsState.save({ screenContent })
				)}
				<SettingsSwitch
					label="Share sound"
					description={sound.note}
					checked={soundOn}
					disabled={!sound.available}
					onclick={() => voiceSettingsState.save({ screenSound: !voiceSettingsState.screenSound })}
				/>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => shareDialogState.close()}>Cancel</Button>
			{#if pickOnly}
				<Button
					disabled={shareDialogState.selected === null}
					onclick={() => shareDialogState.choose(shareDialogState.selected)}
				>
					Share
				</Button>
			{:else}
				<Button disabled={!canShare} onclick={() => shareDialogState.share()}>
					{hasGrid ? 'Share' : 'Choose what to share'}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
