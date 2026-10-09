<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import { updateUser } from '$lib/requests/users/updateUser';
	import { usernameProblem } from '$lib/utils/username';
	import { uploadAvatar } from '$lib/requests/users/uploadAvatar';
	import { deleteUser } from '$lib/requests/users/deleteUser';
	import { fieldErrorsFrom, getErrorMessage } from '$lib/requests/errors';
	import { toast } from 'svelte-sonner';
	import Button from '$lib/components/ui/button/button.svelte';
	import { logout } from '$lib/auth/session';
	import { dropLocalSubscription } from '$lib/utils/push';
	import SettingsForm from './SettingsForm.svelte';
	import SettingsTextField from './SettingsTextField.svelte';
	import DangerZone from './DangerZone.svelte';

	const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
	const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

	const savedUsername = $derived(usersState.loggedInUser?.username ?? '');

	let username = $state('');
	let baselineUsername = $state<string | null>(null);
	let avatarFile: File | null = $state(null);
	let avatarPreview: string | null = $state(null);
	let errors = $state<{ username?: string; avatar?: string }>({});
	let saving = $state(false);
	let loggingOut = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	const usernameChanged = $derived(baselineUsername !== null && username !== baselineUsername);
	const dirty = $derived(usernameChanged || avatarFile !== null);

	$effect(() => {
		const next = savedUsername;
		untrack(() => {
			if (baselineUsername === null || username === baselineUsername) {
				username = next;
				baselineUsername = next;
			}
		});
	});

	function setAvatar(file: File | null) {
		if (avatarPreview) URL.revokeObjectURL(avatarPreview);
		avatarFile = file;
		avatarPreview = file ? URL.createObjectURL(file) : null;
	}

	onDestroy(() => setAvatar(null));

	function handleFileSelect(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		if (!AVATAR_TYPES.includes(file.type)) {
			errors = { ...errors, avatar: 'Use a PNG, JPG, WebP or GIF image.' };
			return;
		}
		if (file.size > AVATAR_MAX_BYTES) {
			errors = { ...errors, avatar: 'That image is over 5 MB.' };
			return;
		}
		errors = { ...errors, avatar: undefined };
		setAvatar(file);
	}

	function reset() {
		username = savedUsername;
		baselineUsername = savedUsername;
		setAvatar(null);
		errors = {};
	}

	async function save() {
		const user = usersState.loggedInUser;
		if (!user) return;

		const trimmed = username.trim();
		const problem = usernameChanged ? usernameProblem(trimmed) : null;
		if (problem) {
			errors = { username: problem };
			return;
		}

		errors = {};
		saving = true;

		let failed = false;
		if (usernameChanged) {
			try {
				const updated = await updateUser(user.id, { username: trimmed });
				usersState.setLoggedInUser(updated);
				username = updated.username;
				baselineUsername = updated.username;
			} catch (e) {
				failed = true;
				const fieldError = fieldErrorsFrom(e).username;
				errors.username = fieldError ?? getErrorMessage(e);
				if (!fieldError) toast.error(`Couldn't change your username: ${getErrorMessage(e)}`);
			}
		}

		if (avatarFile) {
			try {
				const updated = await uploadAvatar(user.id, avatarFile);
				usersState.setLoggedInUser(updated);
				setAvatar(null);
			} catch (e) {
				failed = true;
				errors.avatar = getErrorMessage(e);
				toast.error(`Couldn't upload your avatar: ${getErrorMessage(e)}`);
			}
		}

		saving = false;
		if (!failed) toast.success('Profile updated');
	}

	async function handleLogout() {
		if (loggingOut) return;
		loggingOut = true;
		try {
			overlayState.close();
			await logout();
		} finally {
			loggingOut = false;
		}
	}

	async function handleDeleteAccount() {
		const user = usersState.loggedInUser;
		if (!user) return;
		try {
			await deleteUser(user.id);
		} catch (e) {
			toast.error(`Couldn't delete your account: ${getErrorMessage(e)}`);
			return;
		}
		await dropLocalSubscription();
		usersState.setLoggedInUser(null);
		window.location.href = '/login';
	}
</script>

<SettingsForm {dirty} {saving} onsave={save} onreset={reset}>
	<div class="flex items-center gap-5">
		<div class="shrink-0 overflow-hidden rounded-full">
			<Avatar src={avatarPreview} user={usersState.loggedInUser} size="xl" />
		</div>
		<div class="flex min-w-0 flex-col gap-1.5">
			<div>
				<Button
					variant="secondary"
					class="border border-input"
					aria-describedby="avatar-hint"
					onclick={() => fileInput?.click()}
				>
					Change avatar
				</Button>
				<input
					bind:this={fileInput}
					type="file"
					accept={AVATAR_TYPES.join(',')}
					class="hidden"
					tabindex="-1"
					aria-hidden="true"
					onchange={handleFileSelect}
				/>
			</div>
			{#if errors.avatar}
				<p id="avatar-hint" class="text-xs text-destructive">{errors.avatar}</p>
			{:else}
				<p id="avatar-hint" class="text-xs text-text-subtle">
					{avatarFile
						? `${avatarFile.name} — saved when you press Save.`
						: 'PNG, JPG, WebP or GIF, up to 5 MB.'}
				</p>
			{/if}
		</div>
	</div>

	<SettingsTextField
		id="account-username"
		label="Username"
		bind:value={username}
		error={errors.username}
		oninput={() => (errors.username = undefined)}
	/>

	<div class="flex flex-col gap-2">
		<span class="text-[13px] font-medium text-text-label">Session</span>
		<Button variant="secondary" class="w-fit" disabled={loggingOut} onclick={handleLogout}>
			{loggingOut ? 'Logging out…' : 'Log out'}
		</Button>
	</div>

	<DangerZone
		consequence="Deleting your account removes it permanently."
		actionLabel="Delete account"
		confirmTitle="Delete your account?"
		confirmDescription="This permanently deletes your account and cannot be undone."
		onconfirm={handleDeleteAccount}
	/>
</SettingsForm>
