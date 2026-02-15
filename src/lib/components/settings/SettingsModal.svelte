<script lang="ts">
    import AccountSettings from './AccountSettings.svelte';
    import ServerSettings from './ServerSettings.svelte';
    import ChannelSettings from './ChannelSettings.svelte';
    import { UserStore, CurrentServerStore, CurrentChannelStore } from '$lib/stores/userStore';

    let activeTab = 'account';

    const tabs = [
        { id: 'account', label: 'My Account', component: AccountSettings },
        { id: 'server', label: 'Server Settings', component: ServerSettings, condition: () => $CurrentServerStore !== null },
        { id: 'channel', label: 'Channel Settings', component: ChannelSettings, condition: () => $CurrentChannelStore !== null }
    ];

    $: currentComponent = tabs.find(t => t.id === activeTab)?.component || AccountSettings;
</script>

<div class="flex h-[600px] w-[800px] bg-[#1e1e1e] text-white overflow-hidden rounded-lg">
    <!-- Sidebar -->
    <div class="w-1/4 bg-[#2b2d31] p-4 flex flex-col gap-2">
        <h2 class="text-xs font-bold text-gray-400 uppercase mb-2">Settings</h2>
        
        {#each tabs as tab}
            {#if !tab.condition || tab.condition()}
                <button 
                    class="text-left px-3 py-2 rounded text-sm font-medium transition-colors
                           {activeTab === tab.id ? 'bg-[#404249] text-white' : 'text-gray-400 hover:bg-[#35373c] hover:text-gray-200'}"
                    on:click={() => activeTab = tab.id}
                >
                    {tab.label}
                </button>
            {/if}
        {/each}
    </div>

    <!-- Content -->
    <div class="flex-1 p-8 overflow-y-auto bg-[#313338]">
        <svelte:component this={currentComponent} />
    </div>
</div>
