<script lang="ts">
    import { CurrentServerStore } from '$lib/stores/userStore';
    import { PUBLIC_BASE_URL } from '$env/static/public';
    
    let serverName = $CurrentServerStore?.name || '';
    let iconFile: File | null = null;
    let iconPreview: string | null = $CurrentServerStore?.server_profile?.icon || null;
    let isUploading = false;

    async function handleSave() {
        if (!$CurrentServerStore) return;

        // TODO: Implement name update
        if (iconFile) {
            isUploading = true;
            const formData = new FormData();
            formData.append('file', iconFile);

            try {
                const res = await fetch(`${PUBLIC_BASE_URL}/servers/${$CurrentServerStore.id}/icon`, {
                    method: 'POST',
                    body: formData
                });
                
                if (res.ok) {
                    const updatedServer = await res.json();
                    CurrentServerStore.set(updatedServer); // This might need to update the list too
                    alert('Server icon updated!');
                } else {
                    alert('Failed to update icon');
                }
            } catch (e) {
                console.error(e);
                alert('Error uploading icon');
            } finally {
                isUploading = false;
            }
        }
    }

    function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            iconFile = input.files[0];
            iconPreview = URL.createObjectURL(iconFile);
        }
    }
</script>

<div class="flex flex-col gap-6">
    <h2 class="text-xl font-bold">Server Settings</h2>

    {#if $CurrentServerStore}
        <!-- Icon Section -->
        <div class="flex items-center gap-4">
            <div class="relative group">
                <div class="w-24 h-24 rounded-full overflow-hidden bg-gray-600">
                    {#if iconPreview}
                        <img src={iconPreview} alt="Server Icon" class="w-full h-full object-cover" />
                    {:else}
                        <div class="w-full h-full flex items-center justify-center text-2xl">
                            {serverName[0]?.toUpperCase()}
                        </div>
                    {/if}
                </div>
                <label class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity rounded-full">
                    <span class="text-xs font-bold">CHANGE</span>
                    <input type="file" accept="image/*" class="hidden" on:change={handleFileSelect} />
                </label>
            </div>
        </div>

        <!-- Form -->
        <div class="flex flex-col gap-4 max-w-md">
            <div class="flex flex-col gap-1">
            <label class="text-xs font-bold text-gray-400 uppercase">
                Server Name
                <input 
                    type="text" 
                    bind:value={serverName}
                    class="bg-[#1e1e1e] p-2 rounded border border-transparent focus:border-blue-500 outline-none text-white w-full mt-1"
                />
            </label>
            </div>

            <button 
                class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors disabled:opacity-50"
                on:click={handleSave}
                disabled={isUploading}
            >
                {isUploading ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
    {:else}
        <p>No server selected.</p>
    {/if}
</div>
