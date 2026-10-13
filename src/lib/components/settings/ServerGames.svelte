<script lang="ts">
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { serversState } from '$lib/states/serversState.svelte';
	import { gameVoiceState } from '$lib/states/gameVoiceState.svelte';
	import { createGameIntegration, listGameIntegrations } from '$lib/requests/game';
	import { fieldErrorsFrom, getErrorMessage } from '$lib/requests/errors';
	import type { GameIntegration } from '$lib/types/game.types';
	import Button from '$lib/components/ui/button/button.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import GameIntegrationRow from './GameIntegrationRow.svelte';
	import GameKeyDialog from './GameKeyDialog.svelte';
	import SettingsSwitch from './SettingsSwitch.svelte';
	import SettingsTextField from './SettingsTextField.svelte';
	import { Gamepad2 } from 'lucide-svelte';

	const DEFAULT_NAME = 'Minecraft';
	const selectClass =
		'h-11 w-full rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

	let integrations = $state<GameIntegration[]>([]);
	let isLoading = $state(true);
	let loadError = $state(false);
	let reveal = $state<{ name: string; key: string } | null>(null);

	let formOpen = $state(false);
	let name = $state(DEFAULT_NAME);
	let channelId = $state('');
	let hearSpectators = $state(false);
	let creating = $state(false);
	let formError = $state('');

	const serverId = $derived(serversState.selectedServer?.id);
	const voiceChannels = $derived(
		serversState.selectedServerChannelsList.filter((c) => c.type === 'voice')
	);
	// Changes when a session starts or ends, so the list's active marks and counts refresh.
	const sessionsKey = $derived(
		[...gameVoiceState.sessions.values()]
			.filter((s) => s.server_id === serverId)
			.map((s) => s.integration_id)
			.join(',')
	);

	$effect(() => {
		void sessionsKey;
		if (serverId != null) untrack(() => void fetchIntegrations(serverId));
	});

	async function fetchIntegrations(id: number) {
		loadError = false;
		try {
			const fetched = await listGameIntegrations(id);
			if (id === serverId) integrations = fetched;
		} catch (e) {
			console.error('Failed to fetch game integrations', e);
			if (integrations.length === 0) loadError = true;
		} finally {
			isLoading = false;
		}
	}

	function openForm() {
		name = DEFAULT_NAME;
		channelId = voiceChannels[0] ? String(voiceChannels[0].id) : '';
		hearSpectators = false;
		formError = '';
		formOpen = true;
	}

	async function create() {
		if (serverId == null || creating) return;
		const trimmed = name.trim();
		if (!trimmed) {
			formError = 'Give the integration a name.';
			return;
		}
		if (!channelId) {
			formError = 'Pick a voice channel.';
			return;
		}
		creating = true;
		formError = '';
		try {
			const { key, ...created } = await createGameIntegration(serverId, {
				name: trimmed,
				voice_channel_id: Number(channelId),
				players_hear_spectators: hearSpectators
			});
			integrations = [...integrations, created];
			reveal = { name: created.name, key };
			formOpen = false;
		} catch (e) {
			formError = fieldErrorsFrom(e).name ?? getErrorMessage(e);
		} finally {
			creating = false;
		}
	}

	function replace(updated: GameIntegration) {
		integrations = integrations.map((i) => (i.id === updated.id ? updated : i));
	}
</script>

<div class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
	<div class="flex items-center justify-between gap-3 max-md:flex-col max-md:items-stretch">
		<p class="text-sm text-muted-foreground">
			Connect a game server to a voice channel, so players hear each other by distance.
		</p>
		{#if !formOpen && !loadError}
			<Button variant="secondary" onclick={openForm}>Add integration</Button>
		{/if}
	</div>

	{#if formOpen}
		<form
			class="flex max-w-md flex-col gap-5 rounded-xl border border-border p-4"
			onsubmit={(e) => {
				e.preventDefault();
				void create();
			}}
		>
			<SettingsTextField
				id="game-name"
				label="Name"
				bind:value={name}
				maxlength={32}
				oninput={() => (formError = '')}
			/>
			<div class="flex flex-col gap-1.5">
				<label for="game-channel" class="text-[13px] font-medium text-text-label">
					Voice channel
				</label>
				<select id="game-channel" bind:value={channelId} class={selectClass}>
					{#if voiceChannels.length === 0}
						<option value="" disabled>No voice channels</option>
					{/if}
					{#each voiceChannels as channel (channel.id)}
						<option value={String(channel.id)}>{channel.name}</option>
					{/each}
				</select>
			</div>
			<SettingsSwitch
				label="Players hear people who aren't playing"
				description="Everyone else in the channel is audible to players at full volume."
				checked={hearSpectators}
				onclick={() => (hearSpectators = !hearSpectators)}
			/>
			{#if formError}
				<p class="text-xs text-destructive" role="alert">{formError}</p>
			{/if}
			<div class="flex gap-2">
				<Button type="submit" disabled={creating || voiceChannels.length === 0}>
					{creating ? 'Creating…' : 'Create'}
				</Button>
				<Button variant="ghost" disabled={creating} onclick={() => (formOpen = false)}>
					Cancel
				</Button>
			</div>
		</form>
	{/if}

	{#if isLoading}
		<LoadingList rows={2} />
	{:else if loadError}
		<ErrorState
			title="Couldn’t load integrations"
			description="There was a problem reaching the server."
			onRetry={() => serverId != null && fetchIntegrations(serverId)}
		/>
	{:else if integrations.length === 0 && !formOpen}
		<EmptyState
			title="No game integrations"
			description="Add one to get a key for your game server's plugin."
		>
			{#snippet icon()}
				<Gamepad2 size={20} strokeWidth={1.75} />
			{/snippet}
		</EmptyState>
	{:else}
		{#each integrations as integration (integration.id)}
			<GameIntegrationRow
				{integration}
				{voiceChannels}
				onchange={replace}
				onrotate={(updated, key) => {
					replace(updated);
					reveal = { name: updated.name, key };
				}}
				ondelete={(removed) => (integrations = integrations.filter((i) => i.id !== removed.id))}
			/>
		{/each}
	{/if}
</div>

<GameKeyDialog {reveal} onclose={() => (reveal = null)} />
