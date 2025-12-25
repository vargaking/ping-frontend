<script lang="ts">
    import { CurrentChannelStore } from '$lib/stores/userStore';
    
    let channelName = $CurrentChannelStore?.name || '';
</script>

<div class="flex flex-col gap-6">
    <h2 class="text-xl font-bold">Channel Settings</h2>

    {#if $CurrentChannelStore}
        <div class="flex flex-col gap-4 max-w-md">
            <div class="flex flex-col gap-1">
                <label class="text-xs font-bold text-gray-400 uppercase">Channel Name</label>
                <input 
                    type="text" 
                    bind:value={channelName}
                    class="bg-[#1e1e1e] p-2 rounded border border-transparent focus:border-blue-500 outline-none text-white"
                />
            </div>

            <button class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors">
                Save Changes
            </button>
        </div>
    {:else}
        <p>No channel selected.</p>
    {/if}
</div>
