<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { deleteGameIntegration, rotateGameKey, updateGameIntegration } from '$lib/requests/game';
	import { getErrorMessage } from '$lib/requests/errors';
	import { gameVoiceState } from '$lib/states/gameVoiceState.svelte';
	import type { Channel } from '$lib/types/channel.types';
	import type { GameIntegration, GameIntegrationUpdate } from '$lib/types/game.types';
	import Button from '$lib/components/ui/button/button.svelte';
	import ConfirmActionDialog from './ConfirmActionDialog.svelte';
	import GameLinks from './GameLinks.svelte';
	import SettingsSwitch from './SettingsSwitch.svelte';
	import { ChevronDown } from 'lucide-svelte';

	type Props = {
		integration: GameIntegration;
		voiceChannels: Channel[];
		onchange: (integration: GameIntegration) => void;
		onrotate: (integration: GameIntegration, key: string) => void;
		ondelete: (integration: GameIntegration) => void;
	};

	let { integration, voiceChannels, onchange, onrotate, ondelete }: Props = $props();

	const selectClass =
		'h-10 w-full rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50';

	let saving = $state(false);
	let showLinks = $state(false);
	let rotateOpen = $state(false);
	let deleteOpen = $state(false);

	const uid = $props.id();

	// The session frame is newer than the last list fetch.
	const live = $derived(
		integration.voice_channel_id != null
			? gameVoiceState.session(integration.voice_channel_id)
			: null
	);
	const active = $derived(live ? live.integration_id === integration.id : integration.active);

	async function save(change: GameIntegrationUpdate): Promise<boolean> {
		if (saving) return false;
		saving = true;
		try {
			onchange(await updateGameIntegration(integration.id, change));
			return true;
		} catch (e) {
			toast.error(`Couldn't update ${integration.name}: ${getErrorMessage(e)}`);
			return false;
		} finally {
			saving = false;
		}
	}

	async function rotate() {
		try {
			const { key, key_prefix } = await rotateGameKey(integration.id);
			onrotate({ ...integration, key_prefix }, key);
		} catch (e) {
			toast.error(`Couldn't rotate the key: ${getErrorMessage(e)}`);
		}
	}

	async function remove() {
		try {
			await deleteGameIntegration(integration.id);
			ondelete(integration);
		} catch (e) {
			toast.error(`Couldn't delete ${integration.name}: ${getErrorMessage(e)}`);
		}
	}
</script>

<section
	aria-label={integration.name}
	class="flex flex-col gap-4 rounded-xl border border-border p-4"
>
	<div class="flex items-center gap-3">
		<div class="flex min-w-0 flex-1 flex-col gap-0.5">
			<h3 class="flex items-center gap-2 text-sm font-semibold">
				<span class="truncate">{integration.name}</span>
				{#if active}
					<span class="flex shrink-0 items-center gap-1.5 text-xs font-normal text-text-subtle">
						<span class="h-2 w-2 rounded-full bg-online" aria-hidden="true"></span>
						Active
					</span>
				{/if}
			</h3>
			<p class="truncate font-mono text-xs text-text-subtle">zgk_{integration.key_prefix}…</p>
		</div>
		<Button variant="secondary" size="sm" onclick={() => (rotateOpen = true)}>Rotate key</Button>
		<Button
			variant="ghost"
			size="sm"
			class="text-muted-foreground hover:text-destructive"
			onclick={() => (deleteOpen = true)}
		>
			Delete
		</Button>
	</div>

	<div class="flex max-w-md flex-col gap-1.5">
		<label for="{uid}-channel" class="text-[13px] font-medium text-text-label">
			Voice channel
		</label>
		<select
			id="{uid}-channel"
			class={selectClass}
			value={integration.voice_channel_id ?? ''}
			disabled={saving}
			onchange={async (e) => {
				const select = e.currentTarget;
				const saved = await save({ voice_channel_id: Number(select.value) });
				if (!saved) select.value = String(integration.voice_channel_id ?? '');
			}}
		>
			{#if integration.voice_channel_id == null}
				<option value="" disabled>Pick a voice channel</option>
			{/if}
			{#each voiceChannels as channel (channel.id)}
				<option value={channel.id}>{channel.name}</option>
			{/each}
		</select>
	</div>

	<div class="max-w-md">
		<SettingsSwitch
			label="Players hear people who aren't playing"
			description="Everyone else in the channel is audible to players at full volume."
			checked={integration.players_hear_spectators}
			pending={saving}
			disabled={saving}
			onclick={() => save({ players_hear_spectators: !integration.players_hear_spectators })}
		/>
	</div>

	<div class="flex flex-col gap-2">
		<button
			type="button"
			aria-expanded={showLinks}
			onclick={() => (showLinks = !showLinks)}
			class="flex w-fit items-center gap-1.5 rounded-md text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<ChevronDown
				size={16}
				strokeWidth={1.75}
				class="transition-transform {showLinks ? '' : '-rotate-90'}"
			/>
			Linked players ({integration.linked_count})
		</button>
		{#if showLinks}
			<GameLinks
				integrationId={integration.id}
				oncount={(linked_count) => onchange({ ...integration, linked_count })}
			/>
		{/if}
	</div>
</section>

<ConfirmActionDialog
	bind:open={rotateOpen}
	title="Rotate the key for {integration.name}?"
	description="The current key stops working and a running session ends. You get a new key to paste into the plugin."
	actionLabel="Rotate"
	busyLabel="Rotating…"
	onconfirm={rotate}
/>
<ConfirmActionDialog
	bind:open={deleteOpen}
	title="Delete {integration.name}?"
	description="The key stops working and every player link is removed. This can't be undone."
	actionLabel="Delete"
	busyLabel="Deleting…"
	onconfirm={remove}
/>
