<script lang="ts">
	import { serversState } from '$lib/states/serversState.svelte';
	import { PUBLIC_BASE_URL } from '$env/static/public';

	let serverName = $state(serversState.selectedServer?.name || '');
	let iconFile = $state<File | null>(null);
	let iconPreview = $state<string | null>(
		serversState.selectedServer?.server_profile?.icon || null
	);
	let isUploading = $state(false);

	async function handleSave() {
		if (!serversState.selectedServer) return;

		// TODO: Implement name update
		if (iconFile) {
			isUploading = true;
			const formData = new FormData();
			formData.append('file', iconFile);

			try {
				const res = await fetch(
					`${PUBLIC_BASE_URL}/servers/${serversState.selectedServer.id}/icon`,
					{
						method: 'POST',
						body: formData
					}
				);

				if (res.ok) {
					const updatedServer = await res.json();
					serversState.setSelectedServer(updatedServer);
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

	{#if serversState.selectedServer}
		<!-- Icon Section -->
		<div class="flex items-center gap-4">
			<div class="group relative">
				<div class="h-24 w-24 overflow-hidden rounded-full bg-gray-600">
					{#if iconPreview}
						<img src={iconPreview} alt="Server Icon" class="h-full w-full object-cover" />
					{:else}
						<div class="flex h-full w-full items-center justify-center text-2xl">
							{serverName[0]?.toUpperCase()}
						</div>
					{/if}
				</div>
				<label
					class="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
				>
					<span class="text-xs font-bold">CHANGE</span>
					<input type="file" accept="image/*" class="hidden" onchange={handleFileSelect} />
				</label>
			</div>
		</div>

		<!-- Form -->
		<div class="flex max-w-md flex-col gap-4">
			<div class="flex flex-col gap-1">
				<label class="text-xs font-bold text-gray-400 uppercase">
					Server Name
					<input
						type="text"
						bind:value={serverName}
						class="mt-1 w-full rounded border border-transparent bg-[#1e1e1e] p-2 text-white outline-none focus:border-blue-500"
					/>
				</label>
			</div>

			<button
				class="rounded bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
				onclick={handleSave}
				disabled={isUploading}
			>
				{isUploading ? 'Saving...' : 'Save Changes'}
			</button>
		</div>
	{:else}
		<p>No server selected.</p>
	{/if}
</div>
