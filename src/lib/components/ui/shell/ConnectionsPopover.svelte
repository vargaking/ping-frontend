<script lang="ts">
	import { serversState } from '$lib/states/serversState.svelte';
	import {
		connectionState,
		serverHost,
		DM_SERVER_NAME,
		type ConnectionStatus,
		type VoiceLink,
		type VoiceQuality
	} from '$lib/states/connectionState.svelte';
	import { formatRtt } from '$lib/utils/formatRtt';
	import { usersState } from '$lib/states/usersState.svelte';
	import ServerIcon from '$lib/components/ui/avatar/ServerIcon.svelte';

	const chip: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
		connected: { label: 'Connected', dot: 'bg-online', text: 'text-online' },
		connecting: { label: 'Connecting', dot: 'bg-idle', text: 'text-idle' },
		reconnecting: { label: 'Reconnecting', dot: 'bg-idle', text: 'text-idle' },
		disconnected: { label: 'Disconnected', dot: 'bg-destructive', text: 'text-destructive' }
	};

	const qualityLabel: Record<VoiceQuality, string> = {
		excellent: 'Excellent',
		good: 'Good',
		poor: 'Poor',
		lost: 'Lost',
		unknown: 'Unknown'
	};

	function voiceLine(voice: VoiceLink): string {
		const word =
			voice.status === 'connected' ? qualityLabel[voice.quality] : chip[voice.status].label;
		return `Voice · ${word}`;
	}
</script>

{#snippet row(
	name: string,
	host: string,
	status: ConnectionStatus,
	rttMs: number | null,
	toneKey: number | string,
	iconUrl: string | null,
	iconText: string | null = null,
	iconTone: number | null = null,
	voice: VoiceLink | null = null
)}
	<div class="flex h-12 items-center gap-3 px-4">
		<ServerIcon
			{name}
			serverId={toneKey}
			{iconUrl}
			{iconText}
			{iconTone}
			class="h-7 w-7 rounded-lg text-xs"
		/>
		<div class="flex min-w-0 flex-1 flex-col">
			<span class="truncate text-[13px] font-medium">{name}</span>
			<span class="truncate font-mono text-[11px] text-text-subtle">{host}</span>
			{#if voice}
				<span class="truncate text-[11px] text-text-subtle">{voiceLine(voice)}</span>
			{/if}
		</div>
		<span class="flex shrink-0 items-center gap-1.5 {chip[status].text}">
			<span class="h-1.5 w-1.5 rounded-full {chip[status].dot}"></span>
			<span class="text-[11px]">{chip[status].label}</span>
		</span>
		<span class="w-12 shrink-0 text-right font-mono text-[11px] text-text-subtle"
			>{formatRtt(rttMs)}</span
		>
	</div>
{/snippet}

<div class="w-[420px] py-2">
	{#if connectionState.identity}
		<div class="px-4 pt-1 pb-1.5 text-xs font-medium text-text-subtle">Identity</div>
		{@render row(
			usersState.loggedInUser?.username ?? 'You',
			connectionState.identity.host,
			connectionState.identity.status,
			connectionState.identity.rttMs,
			usersState.loggedInUser?.id ?? 0,
			usersState.loggedInUser?.profile?.avatar ?? null
		)}
	{/if}

	<div
		class="px-4 pt-1 pb-1.5 text-xs font-medium text-text-subtle"
		class:mt-1={connectionState.identity}
	>
		Servers
	</div>
	{@render row(
		DM_SERVER_NAME,
		serverHost,
		connectionState.get(serverHost)?.status ?? 'connecting',
		connectionState.get(serverHost)?.rttMs ?? null,
		DM_SERVER_NAME,
		null,
		'DM'
	)}
	{#each serversState.serversList as server (server.id)}
		{@render row(
			server.name,
			serverHost,
			connectionState.get(serverHost)?.status ?? 'connecting',
			connectionState.get(serverHost)?.rttMs ?? null,
			server.id ?? server.name,
			server.server_profile?.icon ?? null,
			server.icon_text,
			server.icon_tone,
			connectionState.voice?.serverId === server.id ? connectionState.voice : null
		)}
	{/each}
</div>
