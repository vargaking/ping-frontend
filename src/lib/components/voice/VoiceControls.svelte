<script lang="ts">
	import { voiceState } from '$lib/states/voiceState.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { PhoneOff } from 'lucide-svelte';
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';

	const disconnect = () => {
		voiceState.leaveVoice();
	};
</script>

{#if voiceState.connecting}
	<div class="flex flex-col gap-2 border-t border-border bg-sidebar-accent/50 p-2">
		<span class="text-sm font-bold text-idle">Connecting...</span>
	</div>
{:else if voiceState.connected}
	<div class="flex flex-col gap-2 border-t border-border bg-sidebar-accent/50 p-2">
		<div class="flex items-center justify-between">
			<span class="text-sm font-bold text-online">Voice Connected</span>
			<Button
				variant="ghost"
				size="icon"
				onclick={disconnect}
				class="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
			>
				<PhoneOff size={16} />
			</Button>
		</div>

		<div class="flex max-h-40 flex-col gap-1 overflow-y-auto">
			{#each Array.from(voiceState.peers.values()) as peer}
				<div
					class="flex items-center gap-2 rounded p-1 hover:bg-sidebar-accent/50 {peer.isSpeaking
						? 'border-l-2 border-online bg-online/10'
						: ''}"
				>
					<div class="h-6 w-6">
						<Avatar src={peer.profile?.avatar} size="sm" className="w-6 h-6" />
					</div>
					<span class="truncate text-xs {peer.isSpeaking ? 'font-bold text-online' : ''}"
						>{peer.username}</span
					>
				</div>
			{/each}
			{#if voiceState.peers.size === 0}
				<span class="px-1 text-xs text-muted-foreground italic">No one else is here</span>
			{/if}
		</div>

		<div class="mt-1 text-xs text-muted-foreground">
			Channel ID: {voiceState.channelId}
		</div>
	</div>
{/if}
