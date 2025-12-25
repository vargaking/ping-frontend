<script lang="ts">
    import { UserStore } from '$lib/stores/userStore';
    import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
    import { PUBLIC_BASE_URL } from '$env/static/public';
    
    let username = $UserStore?.username || '';
    let avatarFile: File | null = null;
    let avatarPreview: string | null = $UserStore?.profile?.avatar || null;
    let isUploading = false;

    async function handleSave() {
        // TODO: Implement username update
        if (avatarFile && $UserStore) {
            isUploading = true;
            const formData = new FormData();
            formData.append('file', avatarFile);

            try {
                const res = await fetch(`${PUBLIC_BASE_URL}/users/${$UserStore.id}/avatar`, {
                    method: 'POST',
                    body: formData
                });
                
                if (res.ok) {
                    const updatedUser = await res.json();
                    UserStore.set(updatedUser);
                    alert('Avatar updated!');
                } else {
                    alert('Failed to update avatar');
                }
            } catch (e) {
                console.error(e);
                alert('Error uploading avatar');
            } finally {
                isUploading = false;
            }
        }
    }

    function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            avatarFile = input.files[0];
            avatarPreview = URL.createObjectURL(avatarFile);
        }
    }
</script>

<div class="flex flex-col gap-6">
    <h2 class="text-xl font-bold">My Account</h2>

    <!-- Avatar Section -->
    <div class="flex items-center gap-4">
        <div class="relative group">
            <div class="rounded-full overflow-hidden">
                <Avatar src={avatarPreview} user={$UserStore} size="xl" />
            </div>
            <label class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity rounded-full">
                <span class="text-xs font-bold">CHANGE</span>
                <input type="file" accept="image/*" class="hidden" on:change={handleFileSelect} />
            </label>
        </div>
        <div>
            <div class="font-medium text-lg">{username}</div>
            <div class="text-sm text-gray-400">Click image to change avatar</div>
        </div>
    </div>

    <!-- Form -->
    <div class="flex flex-col gap-4 max-w-md">
        <div class="flex flex-col gap-1">
            <label class="text-xs font-bold text-gray-400 uppercase">
                Username
                <input 
                    type="text" 
                    bind:value={username}
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

    <hr class="border-gray-600 my-2" />

    <!-- Danger Zone -->
    <div>
        <h3 class="text-red-400 font-bold mb-2">Danger Zone</h3>
        <button class="border border-red-500 text-red-500 hover:bg-red-500/10 px-4 py-2 rounded text-sm font-medium transition-colors">
            Delete Account
        </button>
    </div>
</div>
