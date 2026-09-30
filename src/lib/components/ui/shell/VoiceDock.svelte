<script lang="ts">
	import type { Snippet } from 'svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { VOICE_SHORTCUTS, matchVoiceShortcut } from '$lib/utils/voiceShortcuts';
	import { voiceSettingsState } from '$lib/states/voiceSettingsState.svelte';
	import { Permission } from '$lib/permissions';
	import {
		SCREEN_CONTENT_LABELS,
		SCREEN_PRESETS,
		screenShareSupported,
		type ScreenContent,
		type ScreenPresetId
	} from '$lib/utils/screenShare';
	import * as Tooltip from '$lib/components/ui/tooltip/index';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
	import {
		Mic,
		MicOff,
		Headphones,
		HeadphoneOff,
		PhoneOff,
		ScreenShare,
		ScreenShareOff,
		ChevronUp
	} from 'lucide-svelte';

	const channelName = $derived.by(() => {
		const { channelId, serverId } = voiceState;
		if (channelId == null) return 'Voice';
		const live = serverId != null ? serversState.channels[serverId]?.[channelId]?.name : undefined;
		return live ?? voiceState.channelName ?? 'Voice';
	});
	const channelHref = $derived(
		voiceState.serverId != null && voiceState.channelId != null
			? `/app/server/${voiceState.serverId}/voice/${voiceState.channelId}/`
			: null
	);

	// The call's server, which may not be the one being browsed.
	const canShare = $derived(
		screenShareSupported() && serversState.can(Permission.STREAM, voiceState.serverId)
	);

	// Capture phase, so the shortcuts still work while the composer has focus.
	function handleKeydown(e: KeyboardEvent) {
		const shortcut = matchVoiceShortcut(e);
		if (!shortcut) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.repeat) return;
		if (shortcut === 'mute') voiceState.toggleMute();
		else voiceState.toggleDeafen();
	}

	const iconButton =
		'flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
</script>

<svelte:window onkeydowncapture={handleKeydown} />

{#snippet control(
	label: string,
	keys: string,
	pressed: boolean,
	onclick: () => void,
	icon: Snippet,
	tone: 'danger' | 'primary' = 'danger'
)}
	<Tooltip.Root delayDuration={300}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					aria-label={label}
					aria-pressed={pressed}
					aria-keyshortcuts={keys || undefined}
					{onclick}
					class="{iconButton} {pressed
						? tone === 'primary'
							? 'bg-primary/10 text-primary hover:bg-primary/20'
							: 'text-destructive hover:bg-destructive/10'
						: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
				>
					{@render icon()}
				</button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>
			{label}
			{#if keys}<span class="ml-1 font-mono opacity-70">{keys}</span>{/if}
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

{#snippet micIcon()}
	{#if voiceState.micOff}
		<MicOff size={18} strokeWidth={1.75} />
	{:else}
		<Mic size={18} strokeWidth={1.75} />
	{/if}
{/snippet}

{#snippet deafenIcon()}
	{#if voiceState.deafened}
		<HeadphoneOff size={18} strokeWidth={1.75} />
	{:else}
		<Headphones size={18} strokeWidth={1.75} />
	{/if}
{/snippet}

{#snippet shareIcon()}
	{#if voiceState.sharing}
		<ScreenShareOff size={18} strokeWidth={1.75} />
	{:else}
		<ScreenShare size={18} strokeWidth={1.75} />
	{/if}
{/snippet}

{#if voiceState.connecting || voiceState.connected || voiceState.reconnecting}
	<div class="mx-2 mb-2 rounded-[10px] border border-input bg-card p-2.5">
		<div class="mb-2 flex flex-col gap-0.5">
			<span class="text-xs font-medium {voiceState.reconnecting ? 'text-idle' : 'text-online'}">
				{voiceState.reconnecting
					? 'Reconnecting…'
					: voiceState.connecting
						? 'Connecting…'
						: 'Voice connected'}
			</span>
			{#if channelHref}
				<a
					href={channelHref}
					class="truncate rounded-sm text-[13px] text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					{channelName}
				</a>
			{:else}
				<span class="truncate text-[13px] text-muted-foreground">{channelName}</span>
			{/if}
		</div>

		<Tooltip.Provider>
			<div class="flex items-center gap-2">
				{@render control(
					voiceState.micOff ? 'Unmute' : 'Mute',
					VOICE_SHORTCUTS.mute.keys,
					voiceState.micOff,
					() => voiceState.toggleMute(),
					micIcon
				)}
				{@render control(
					voiceState.deafened ? 'Undeafen' : 'Deafen',
					VOICE_SHORTCUTS.deafen.keys,
					voiceState.deafened,
					() => voiceState.toggleDeafen(),
					deafenIcon
				)}
				{#if canShare}
					<div class="flex items-center">
						{@render control(
							voiceState.sharing ? 'Stop sharing' : 'Share screen',
							'',
							voiceState.sharing,
							() =>
								voiceState.sharing ? voiceState.stopScreenShare() : voiceState.startScreenShare(),
							shareIcon,
							'primary'
						)}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger
								aria-label="Screen share options"
								class="flex h-9 w-5 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
							>
								<ChevronUp size={14} strokeWidth={1.75} />
							</DropdownMenu.Trigger>
							<DropdownMenu.Content side="top" align="start" class="w-48">
								<DropdownMenu.Group>
									<DropdownMenu.Label>Quality</DropdownMenu.Label>
									<DropdownMenu.RadioGroup
										value={voiceSettingsState.screenPreset}
										onValueChange={(value) => voiceState.setScreenQuality(value as ScreenPresetId)}
									>
										{#each Object.entries(SCREEN_PRESETS) as [id, { label }] (id)}
											<DropdownMenu.RadioItem value={id}>{label}</DropdownMenu.RadioItem>
										{/each}
									</DropdownMenu.RadioGroup>
								</DropdownMenu.Group>
								<DropdownMenu.Separator />
								<DropdownMenu.Group>
									<DropdownMenu.Label>Optimize for</DropdownMenu.Label>
									<DropdownMenu.RadioGroup
										value={voiceSettingsState.screenContent}
										onValueChange={(value) => voiceState.setScreenContent(value as ScreenContent)}
									>
										{#each Object.entries(SCREEN_CONTENT_LABELS) as [id, label] (id)}
											<DropdownMenu.RadioItem value={id}>{label}</DropdownMenu.RadioItem>
										{/each}
									</DropdownMenu.RadioGroup>
								</DropdownMenu.Group>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				{/if}
				<button
					type="button"
					aria-label="Leave voice"
					onclick={() => voiceState.leaveVoice()}
					class="{iconButton} ml-auto text-destructive hover:bg-destructive/10"
				>
					<PhoneOff size={18} strokeWidth={1.75} />
				</button>
			</div>
		</Tooltip.Provider>
	</div>
{/if}
