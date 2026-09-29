<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { updateServer } from '$lib/requests/servers/updateServer';
	import { uploadServerIcon } from '$lib/requests/servers/uploadServerIcon';
	import { fieldErrorsFrom, getErrorMessage } from '$lib/requests/errors';
	import { ICON_TYPES, iconProblem } from '$lib/utils/serverIcon';
	import Button from '$lib/components/ui/button/button.svelte';
	import SettingsForm from './SettingsForm.svelte';
	import SettingsTextField from './SettingsTextField.svelte';

	const server = $derived(serversState.selectedServer);
	const savedName = $derived(server?.name ?? '');
	const savedIcon = $derived<string | null>(server?.server_profile?.icon ?? null);

	let name = $state('');
	let baselineName = $state<string | null>(null);
	let iconFile = $state<File | null>(null);
	let iconPreview = $state<string | null>(null);
	let errors = $state<{ name?: string; icon?: string }>({});
	let saving = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	const nameChanged = $derived(baselineName !== null && name !== baselineName);
	const dirty = $derived(nameChanged || iconFile !== null);

	// While the name is untouched, follow the saved value (e.g. a rename that
	// arrived from another tab).
	$effect(() => {
		const next = savedName;
		untrack(() => {
			if (baselineName === null || name === baselineName) {
				name = next;
				baselineName = next;
			}
		});
	});

	function setIcon(file: File | null) {
		if (iconPreview) URL.revokeObjectURL(iconPreview);
		iconFile = file;
		iconPreview = file ? URL.createObjectURL(file) : null;
	}

	onDestroy(() => setIcon(null));

	function handleFileSelect(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		const problem = iconProblem(file);
		if (problem) {
			errors = { ...errors, icon: problem };
			return;
		}
		errors = { ...errors, icon: undefined };
		setIcon(file);
	}

	function reset() {
		name = savedName;
		baselineName = savedName;
		setIcon(null);
		errors = {};
	}

	async function save() {
		const serverId = server?.id;
		if (serverId == null) return;

		const trimmed = name.trim();
		if (!trimmed) {
			errors = { name: "Server name can't be empty." };
			return;
		}

		errors = {};
		saving = true;

		// Each part is committed as soon as it succeeds, so a failed icon upload
		// doesn't undo (or re-send) a rename that already went through.
		let failed = false;
		if (nameChanged) {
			try {
				const updated = await updateServer(serverId, { name: trimmed });
				serversState.patchServer(serverId, { name: updated.name });
				name = updated.name;
				baselineName = updated.name;
			} catch (e) {
				failed = true;
				errors.name = fieldErrorsFrom(e).name ?? getErrorMessage(e);
				toast.error(`Couldn't rename the server: ${getErrorMessage(e)}`);
			}
		}

		if (iconFile) {
			try {
				const updated = await uploadServerIcon(serverId, iconFile);
				serversState.patchServer(serverId, { server_profile: updated.server_profile });
				setIcon(null);
			} catch (e) {
				failed = true;
				errors.icon = getErrorMessage(e);
				toast.error(`Couldn't upload the icon: ${getErrorMessage(e)}`);
			}
		}

		saving = false;
		if (!failed) toast.success('Server updated');
	}

	const shownIcon = $derived(iconPreview ?? savedIcon);
</script>

{#if server}
	<SettingsForm {dirty} {saving} onsave={save} onreset={reset}>
		<div class="flex items-center gap-5">
			<div
				class="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-card text-2xl font-semibold text-text-label"
			>
				{#if shownIcon}
					<img src={shownIcon} alt="" class="h-full w-full object-cover" />
				{:else}
					{(name.trim() || savedName)[0]?.toUpperCase()}
				{/if}
			</div>
			<div class="flex flex-col gap-1.5">
				<div>
					<Button
						variant="secondary"
						class="border border-input"
						aria-describedby="server-icon-hint"
						onclick={() => fileInput?.click()}
					>
						Change icon
					</Button>
					<input
						bind:this={fileInput}
						type="file"
						accept={ICON_TYPES.join(',')}
						class="hidden"
						tabindex="-1"
						aria-hidden="true"
						onchange={handleFileSelect}
					/>
				</div>
				{#if errors.icon}
					<p id="server-icon-hint" class="text-xs text-destructive">{errors.icon}</p>
				{:else}
					<p id="server-icon-hint" class="text-xs text-text-subtle">
						{iconFile
							? `${iconFile.name} — saved when you press Save.`
							: 'PNG, JPG, WebP or GIF, up to 5 MB. Square images look best.'}
					</p>
				{/if}
			</div>
		</div>

		<SettingsTextField
			id="server-name"
			label="Server name"
			bind:value={name}
			error={errors.name}
			oninput={() => (errors.name = undefined)}
			maxlength={100}
		/>
	</SettingsForm>
{/if}
