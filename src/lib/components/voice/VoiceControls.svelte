<script lang="ts">
    import { voiceStore } from '$lib/stores/voiceStore';
    import Button from '$lib/components/ui/button/button.svelte';
    import { PhoneOff } from 'lucide-svelte';
    import Avatar from '$lib/components/ui/avatar/Avatar.svelte';

    const disconnect = () => {
        voiceStore.leaveVoice();
    };
</script>

{#if $voiceStore.connecting}
    <div class="flex flex-col gap-2 border-t border-border p-2 bg-sidebar-accent/50">
        <span class="text-sm font-bold text-yellow-500">Connecting...</span>
    </div>
{:else if $voiceStore.connected}
    <div class="flex flex-col gap-2 border-t border-border p-2 bg-sidebar-accent/50">
        <div class="flex items-center justify-between">
            <span class="text-sm font-bold text-green-500">Voice Connected</span>
            <Button variant="ghost" size="icon" onclick={disconnect} class="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                <PhoneOff size={16} />
            </Button>
        </div>
        
        <div class="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {#each Array.from($voiceStore.peers.values()) as peer}
                <div class="flex items-center gap-2 p-1 rounded hover:bg-sidebar-accent/50 {peer.isSpeaking ? 'border-l-2 border-green-500 bg-green-500/10' : ''}">
                <div class="h-6 w-6">
                    <Avatar 
                        src={peer.profile?.avatar} 
                        size="sm" 
                        className="w-6 h-6" 
                    />
                </div>
                    <span class="text-xs truncate {peer.isSpeaking ? 'font-bold text-green-500' : ''}">{peer.username}</span>
                </div>
            {/each}
            {#if $voiceStore.peers.size === 0}
                <span class="text-xs text-muted-foreground italic px-1">No one else is here</span>
            {/if}
        </div>

        <div class="text-xs text-muted-foreground mt-1">
            Channel ID: {$voiceStore.channelId}
        </div>
    </div>
{/if}
