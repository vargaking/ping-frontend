<script lang="ts">
	import { usersState } from '$lib/states/usersState.svelte';
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import { updateUser } from '$lib/requests/users/updateUser';
	import { uploadAvatar } from '$lib/requests/users/uploadAvatar';
	import { deleteUser } from '$lib/requests/users/deleteUser';
	import { toast } from 'svelte-sonner';

	let username = $state(usersState.loggedInUser?.username ?? '');
	let avatarFile: File | null = $state(null);
	let avatarPreview: string | null = $state(null);
	let isSaving = $state(false);
	let fileInput: HTMLInputElement;

	const hasUsernameChanged = $derived(username !== (usersState.loggedInUser?.username ?? ''));
	const hasChanges = $derived(hasUsernameChanged || avatarFile !== null);

	async function handleSave() {
		const user = usersState.loggedInUser;
		if (!user || !hasChanges) return;

		isSaving = true;

		try {
			if (hasUsernameChanged) {
				const updated = await updateUser({ ...user, username });
				usersState.setLoggedInUser(updated);
			}

			if (avatarFile) {
				const updated = await uploadAvatar(user.id, avatarFile);
				usersState.setLoggedInUser(updated);
				avatarFile = null;
				avatarPreview = null;
			}

			toast.success('Profile updated successfully');
		} catch (e: any) {
			const message = e?.response?.data?.detail ?? 'Failed to save changes';
			console.error('Save failed:', e);
			toast.error(message);
		} finally {
			isSaving = false;
		}
	}

	async function handleDeleteAccount() {
		const user = usersState.loggedInUser;
		if (!user) return;

		if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;

		try {
			await deleteUser(user.id);
			usersState.setLoggedInUser(null);
			window.location.href = '/login';
		} catch (e: any) {
			const message = e?.response?.data?.detail ?? 'Failed to delete account';
			console.error('Delete failed:', e);
			toast.error(message);
		}
	}

	function handleFileSelect() {
		const file = fileInput?.files?.[0];
		if (file) {
			avatarFile = file;
			avatarPreview = URL.createObjectURL(file);
		}
	}
</script>

<div class="flex flex-col gap-6">
	<h2 class="text-xl font-bold">My Account</h2>

	<!-- Avatar -->
	<div class="flex items-center gap-4">
		<div class="group relative">
			<div class="overflow-hidden rounded-full">
				<Avatar src={avatarPreview} user={usersState.loggedInUser} size="xl" />
			</div>
			<label
				class="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
			>
				<span class="text-xs font-bold">CHANGE</span>
				<input
					type="file"
					accept="image/*"
					class="hidden"
					bind:this={fileInput}
					onchange={handleFileSelect}
				/>
			</label>
		</div>
		<div>
			<div class="text-lg font-medium">{usersState.loggedInUser?.username ?? ''}</div>
			<div class="text-sm text-gray-400">Click image to change avatar</div>
		</div>
	</div>

	<!-- Form -->
	<div class="flex max-w-md flex-col gap-4">
		<div class="flex flex-col gap-1">
			<label class="text-xs font-bold text-gray-400 uppercase">
				Username
				<input
					type="text"
					bind:value={username}
					class="mt-1 w-full rounded border border-transparent bg-[#1e1e1e] p-2 text-white outline-none focus:border-blue-500"
				/>
			</label>
		</div>

		<button
			class="rounded bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
			onclick={handleSave}
			disabled={isSaving || !hasChanges}
		>
			{isSaving ? 'Saving...' : 'Save Changes'}
		</button>
	</div>

	<hr class="my-2 border-gray-600" />

	<!-- Danger Zone -->
	<div>
		<h3 class="mb-2 font-bold text-red-400">Danger Zone</h3>
		<button
			class="rounded border border-red-500 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
			onclick={handleDeleteAccount}
		>
			Delete Account
		</button>
	</div>
</div>
