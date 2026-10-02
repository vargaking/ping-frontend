<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { updateServer } from '$lib/requests/servers/updateServer';
	import { uploadServerIcon } from '$lib/requests/servers/uploadServerIcon';
	import { deleteServerIcon } from '$lib/requests/servers/deleteServerIcon';
	import { fieldErrorsFrom, getErrorMessage } from '$lib/requests/errors';
	import { ICON_TYPES, iconProblem } from '$lib/utils/serverIcon';
	import { avatarTone, graphemes, toneClass, TONE_COUNT } from '$lib/utils/avatar';
	import type { ServerSettings } from '$lib/types/server.types';
	import { Check } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ServerIcon from '$lib/components/ui/avatar/ServerIcon.svelte';
	import SettingsForm from './SettingsForm.svelte';
	import SettingsTextField from './SettingsTextField.svelte';
	import DeleteServerZone from './DeleteServerZone.svelte';

	const server = $derived(serversState.selectedServer);
	const savedName = $derived(server?.name ?? '');
	const savedIcon = $derived<string | null>(server?.server_profile?.icon ?? null);
	const savedText = $derived(server?.icon_text ?? '');
	const savedTone = $derived(server?.icon_tone ?? avatarTone(server?.id ?? ''));

	const savedWelcome = $derived(server?.server_profile?.welcome_message ?? '');
	const textChannels = $derived(
		serversState.selectedServerChannelsList.filter((c) => c.type === 'text')
	);
	// A default that points at a deleted channel behaves like the welcome screen.
	const savedLanding = $derived.by(() => {
		const id = server?.server_settings?.default_channel_id;
		return id != null && textChannels.some((c) => c.id === id) ? String(id) : WELCOME_SCREEN;
	});

	const WELCOME_SCREEN = '';
	const WELCOME_MAX = 1000;
	const selectClass =
		'h-11 w-full rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
	const ICON_TEXT_MAX = 2;
	const TONE_NAMES = ['Blue', 'Green', 'Yellow', 'Purple', 'Teal', 'Grey'];
	const TONES = Array.from({ length: TONE_COUNT }, (_, i) => i + 1);

	let name = $state('');
	let baselineName = $state<string | null>(null);
	let iconFile = $state<File | null>(null);
	let iconPreview = $state<string | null>(null);
	let iconMode = $state<'image' | 'text'>('image');
	let iconText = $state('');
	let iconTone = $state(1);
	let baselineText = $state<string | null>(null);
	let baselineTone = $state<number | null>(null);
	let removeImage = $state(false);
	let welcome = $state('');
	let baselineWelcome = $state<string | null>(null);
	let landing = $state(WELCOME_SCREEN);
	let baselineLanding = $state<string | null>(null);
	let errors = $state<{ name?: string; icon?: string; iconText?: string; welcome?: string }>({});
	let saving = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	const nameChanged = $derived(baselineName !== null && name !== baselineName);
	const textChanged = $derived(baselineText !== null && iconText !== baselineText);
	const toneChanged = $derived(baselineTone !== null && iconTone !== baselineTone);
	// Picking Text means the rail shows the text, so a stored image has to go.
	const dropsImage = $derived(
		savedIcon !== null && iconFile === null && (removeImage || iconMode === 'text')
	);
	const welcomeChanged = $derived(baselineWelcome !== null && welcome !== baselineWelcome);
	const landingChanged = $derived(baselineLanding !== null && landing !== baselineLanding);
	const dirty = $derived(
		nameChanged ||
			iconFile !== null ||
			textChanged ||
			toneChanged ||
			dropsImage ||
			welcomeChanged ||
			landingChanged
	);

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

	$effect(() => {
		const nextText = savedText;
		const nextTone = savedTone;
		untrack(() => {
			if (baselineText === null) iconMode = !savedIcon && nextText ? 'text' : 'image';
			if (baselineText === null || iconText === baselineText) {
				iconText = nextText;
				baselineText = nextText;
			}
			if (baselineTone === null || iconTone === baselineTone) {
				iconTone = nextTone;
				baselineTone = nextTone;
			}
		});
	});

	$effect(() => {
		const next = savedWelcome;
		untrack(() => {
			if (baselineWelcome === null || welcome === baselineWelcome) {
				welcome = next;
				baselineWelcome = next;
			}
		});
	});

	$effect(() => {
		const next = savedLanding;
		untrack(() => {
			if (baselineLanding === null || landing === baselineLanding) {
				landing = next;
				baselineLanding = next;
			}
		});
	});

	function limitIconText(typed: string): string {
		return graphemes(typed.replace(/\s/g, '')).slice(0, ICON_TEXT_MAX).join('');
	}

	function chooseMode(mode: 'image' | 'text') {
		iconMode = mode;
		if (mode === 'text') setIcon(null);
	}

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
		removeImage = false;
		setIcon(file);
	}

	function reset() {
		name = savedName;
		baselineName = savedName;
		iconText = savedText;
		baselineText = savedText;
		iconTone = savedTone;
		baselineTone = savedTone;
		iconMode = !savedIcon && savedText ? 'text' : 'image';
		welcome = savedWelcome;
		baselineWelcome = savedWelcome;
		landing = savedLanding;
		baselineLanding = savedLanding;
		removeImage = false;
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

		if (textChanged || toneChanged) {
			try {
				const updated = await updateServer(serverId, {
					icon_text: iconText || null,
					icon_tone: iconTone
				});
				serversState.patchServer(serverId, {
					icon_text: updated.icon_text,
					icon_tone: updated.icon_tone
				});
				iconText = updated.icon_text ?? '';
				baselineText = iconText;
				iconTone = updated.icon_tone ?? iconTone;
				baselineTone = iconTone;
			} catch (e) {
				failed = true;
				errors.iconText = fieldErrorsFrom(e).icon_text ?? getErrorMessage(e);
			}
		}

		if (welcomeChanged || landingChanged) {
			try {
				const updated = await updateServer(serverId, {
					...(welcomeChanged && { server_profile: { welcome_message: welcome.trim() || null } }),
					...(landingChanged && {
						server_settings: { default_channel_id: landing ? Number(landing) : null }
					})
				});
				const settings = { ...server?.server_settings } as ServerSettings;
				if (landing) settings.default_channel_id = Number(landing);
				else delete settings.default_channel_id;
				serversState.patchServer(serverId, {
					server_profile: updated.server_profile,
					server_settings: settings
				});
				welcome = updated.server_profile?.welcome_message ?? '';
				baselineWelcome = welcome;
				baselineLanding = landing;
			} catch (e) {
				failed = true;
				errors.welcome = fieldErrorsFrom(e).welcome_message ?? getErrorMessage(e);
				toast.error(`Couldn't save the welcome settings: ${getErrorMessage(e)}`);
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
		} else if (dropsImage && !errors.iconText) {
			try {
				const updated = await deleteServerIcon(serverId);
				serversState.patchServer(serverId, { server_profile: updated.server_profile });
				removeImage = false;
			} catch (e) {
				failed = true;
				errors.icon = getErrorMessage(e);
				toast.error(`Couldn't remove the image: ${getErrorMessage(e)}`);
			}
		}

		saving = false;
		if (!failed) toast.success('Server updated');
	}

	const shownImage = $derived(
		iconMode === 'image' ? (iconPreview ?? (removeImage ? null : savedIcon)) : null
	);
</script>

{#if server}
	<SettingsForm {dirty} {saving} onsave={save} onreset={reset}>
		<div class="flex flex-col gap-5">
			<div class="flex items-center gap-5">
				<ServerIcon
					name={name.trim() || savedName}
					serverId={server.id ?? savedName}
					iconUrl={shownImage}
					iconText={iconText || null}
					{iconTone}
					class="h-[72px] w-[72px] rounded-[18px] text-2xl"
				/>
				<div class="flex flex-col gap-2">
					<div role="group" aria-label="Icon type" class="flex w-fit rounded-[10px] bg-card p-0.5">
						{#each [['image', 'Image'], ['text', 'Text']] as const as [mode, label] (mode)}
							<button
								type="button"
								aria-pressed={iconMode === mode}
								onclick={() => chooseMode(mode)}
								class="h-8 rounded-lg px-4 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {iconMode ===
								mode
									? 'bg-accent text-foreground'
									: 'text-muted-foreground hover:text-foreground'}"
							>
								{label}
							</button>
						{/each}
					</div>
					{#if iconMode === 'image'}
						<div class="flex items-center gap-2">
							<Button
								variant="secondary"
								class="border border-input"
								aria-describedby="server-icon-hint"
								onclick={() => fileInput?.click()}
							>
								Change icon
							</Button>
							{#if savedIcon && !iconFile && !removeImage}
								<Button variant="ghost" onclick={() => (removeImage = true)}>Remove image</Button>
							{/if}
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
									: removeImage
										? 'The image is removed when you press Save.'
										: 'PNG, JPG, WebP or GIF, up to 5 MB. Square images look best.'}
							</p>
						{/if}
					{/if}
				</div>
			</div>

			{#if iconMode === 'text'}
				<SettingsTextField
					id="server-icon-text"
					label="Icon text"
					bind:value={iconText}
					normalize={limitIconText}
					error={errors.iconText}
					hint="Up to 2 characters"
					oninput={() => (errors.iconText = undefined)}
				/>
				<div role="radiogroup" aria-label="Icon colour" class="flex items-center gap-2">
					{#each TONES as tone (tone)}
						<button
							type="button"
							role="radio"
							aria-checked={iconTone === tone}
							aria-label={TONE_NAMES[tone - 1]}
							onclick={() => (iconTone = tone)}
							class="flex h-8 w-8 items-center justify-center rounded-full {toneClass(
								tone
							)} focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none {iconTone ===
							tone
								? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
								: ''}"
						>
							{#if iconTone === tone}<Check size={16} aria-hidden="true" />{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<SettingsTextField
			id="server-name"
			label="Server name"
			bind:value={name}
			error={errors.name}
			oninput={() => (errors.name = undefined)}
			maxlength={100}
		/>

		<div class="flex max-w-md flex-col gap-5">
			<h3 class="text-sm font-semibold">Welcome</h3>
			<SettingsTextField
				id="server-welcome"
				label="Welcome message"
				bind:value={welcome}
				multiline
				maxlength={WELCOME_MAX}
				placeholder="Say hello to new members"
				error={errors.welcome}
				hint="{welcome.length} / {WELCOME_MAX}"
				oninput={() => (errors.welcome = undefined)}
			/>
			<div class="flex flex-col gap-1.5">
				<label for="server-landing" class="text-[13px] font-medium text-text-label">
					When members open the server
				</label>
				<select id="server-landing" bind:value={landing} class={selectClass}>
					<option value={WELCOME_SCREEN}>Show the welcome screen</option>
					{#each textChannels as channel (channel.id)}
						<option value={String(channel.id)}>Open #{channel.name}</option>
					{/each}
				</select>
			</div>
		</div>

		{#if serversState.isSelectedServerOwner}
			<DeleteServerZone />
		{/if}
	</SettingsForm>
{/if}
