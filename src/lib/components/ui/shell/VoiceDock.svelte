<script lang="ts">
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { Mic, MicOff, Headphones, HeadphoneOff, PhoneOff } from 'lucide-svelte';

	const channelName = $derived(
		voiceState.channelId != null
			? (serversState.selectedServerChannels[voiceState.channelId]?.name ?? 'Voice')
			: 'Voice'
	);
</script>

{#if voiceState.connecting || voiceState.connected}
	<div class="mx-2 mb-2 rounded-[10px] border border-input bg-card p-2.5">
		<div class="mb-2 flex flex-col gap-0.5">
			<span class="text-xs font-medium text-online">
				{voiceState.connecting ? 'Connecting…' : 'Voice connected'}
			</span>
			<span class="truncate text-[13px] text-muted-foreground">{channelName}</span>
		</div>

		<div class="flex items-center gap-2">
			<button
				type="button"
				aria-label={voiceState.muted ? 'Unmute microphone' : 'Mute microphone'}
				aria-pressed={voiceState.muted}
				onclick={() => voiceState.toggleMute()}
				class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {voiceState.muted
					? 'text-destructive'
					: ''}"
			>
				{#if voiceState.muted}
					<MicOff size={18} strokeWidth={1.75} />
				{:else}
					<Mic size={18} strokeWidth={1.75} />
				{/if}
			</button>
			<button
				type="button"
				aria-label={voiceState.deafened ? 'Undeafen' : 'Deafen'}
				aria-pressed={voiceState.deafened}
				onclick={() => voiceState.toggleDeafen()}
				class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {voiceState.deafened
					? 'text-destructive'
					: ''}"
			>
				{#if voiceState.deafened}
					<HeadphoneOff size={18} strokeWidth={1.75} />
				{:else}
					<Headphones size={18} strokeWidth={1.75} />
				{/if}
			</button>
			<button
				type="button"
				aria-label="Leave voice"
				onclick={() => voiceState.leaveVoice()}
				class="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<PhoneOff size={18} strokeWidth={1.75} />
			</button>
		</div>
	</div>
{/if}
