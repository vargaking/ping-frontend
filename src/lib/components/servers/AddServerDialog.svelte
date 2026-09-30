<script lang="ts" module>
	export type AddServerTab = 'create' | 'join';
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { serversState } from '$lib/states/serversState.svelte';
	import { createServer } from '$lib/requests/servers/createServer';
	import { uploadServerIcon } from '$lib/requests/servers/uploadServerIcon';
	import { fieldErrorsFrom, getErrorMessage } from '$lib/requests/errors';
	import { ICON_TYPES, iconProblem } from '$lib/utils/serverIcon';
	import { parseInviteCode } from '$lib/utils/inviteCode';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Button from '$lib/components/ui/button/button.svelte';
	import SettingsTextField from '$lib/components/settings/SettingsTextField.svelte';
	import { ImagePlus } from 'lucide-svelte';

	let {
		open = $bindable(false),
		tab = $bindable<AddServerTab>('create')
	}: { open?: boolean; tab?: AddServerTab } = $props();

	const uid = $props.id();
	const tabs: { id: AddServerTab; label: string }[] = [
		{ id: 'create', label: 'Create' },
		{ id: 'join', label: 'Join' }
	];

	let name = $state('');
	let nameError = $state('');
	let iconFile = $state<File | null>(null);
	let iconPreview = $state<string | null>(null);
	let iconError = $state('');
	let creating = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	let code = $state('');
	let codeError = $state('');

	const canCreate = $derived(name.trim().length > 0 && !creating);

	function setIcon(file: File | null) {
		if (iconPreview) URL.revokeObjectURL(iconPreview);
		iconFile = file;
		iconPreview = file ? URL.createObjectURL(file) : null;
	}

	function reset() {
		name = '';
		nameError = '';
		setIcon(null);
		iconError = '';
		code = '';
		codeError = '';
	}

	$effect(() => {
		if (!open) untrack(reset);
	});

	function handleOpenChange(next: boolean) {
		if (!next && creating) return;
		open = next;
	}

	function focusField() {
		document.getElementById(`${uid}-${tab === 'create' ? 'name' : 'code'}`)?.focus();
	}

	function handleTabKeydown(e: KeyboardEvent) {
		const at = tabs.findIndex((t) => t.id === tab);
		let next: number;
		if (e.key === 'ArrowRight') next = (at + 1) % tabs.length;
		else if (e.key === 'ArrowLeft') next = (at - 1 + tabs.length) % tabs.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = tabs.length - 1;
		else return;

		e.preventDefault();
		tab = tabs[next].id;
		document.getElementById(`${uid}-tab-${tab}`)?.focus();
	}

	function handleFileSelect(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		const problem = iconProblem(file);
		iconError = problem ?? '';
		if (!problem) setIcon(file);
	}

	async function create() {
		const trimmed = name.trim();
		if (!trimmed || creating) return;

		creating = true;
		nameError = '';
		try {
			const server = await createServer({ name: trimmed });
			serversState.addServer(server);
			if (server.id != null) {
				serversState
					.fetchServerChannels(server.id)
					.catch((e) => console.warn('Failed to load channels for new server', e));
			}

			// The server exists from here on, so a failed icon doesn't undo it.
			if (iconFile && server.id != null) {
				try {
					const updated = await uploadServerIcon(server.id, iconFile);
					serversState.patchServer(server.id, { server_profile: updated.server_profile });
				} catch (e) {
					console.error('Failed to upload server icon', e);
					toast.warning("Server created, but the icon couldn't be uploaded");
				}
			}

			creating = false;
			open = false;
			await goto(`/app/server/${server.id}/`);
		} catch (e) {
			creating = false;
			nameError = fieldErrorsFrom(e).name ?? '';
			toast.error(`Couldn't create the server: ${getErrorMessage(e)}`);
		}
	}

	function join() {
		const inviteCode = parseInviteCode(code);
		if (!inviteCode) {
			codeError = "That doesn't look like an invite link or code.";
			return;
		}
		open = false;
		goto(`/invite/${inviteCode}`);
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="sm:max-w-md" onOpenAutoFocus={(e) => (e.preventDefault(), focusField())}>
		<Dialog.Header>
			<Dialog.Title>Add a server</Dialog.Title>
			<Dialog.Description>Start your own, or join one you were invited to.</Dialog.Description>
		</Dialog.Header>

		<div
			role="tablist"
			aria-label="Add a server"
			tabindex="-1"
			class="flex gap-1 rounded-lg bg-surface-input p-1"
			onkeydown={handleTabKeydown}
		>
			{#each tabs as t (t.id)}
				<button
					type="button"
					role="tab"
					id="{uid}-tab-{t.id}"
					aria-selected={tab === t.id}
					aria-controls="{uid}-panel-{t.id}"
					tabindex={tab === t.id ? 0 : -1}
					onclick={() => (tab = t.id)}
					class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {tab ===
					t.id
						? 'bg-accent text-foreground shadow-xs'
						: 'text-text-subtle hover:text-foreground'}"
				>
					{t.label}
				</button>
			{/each}
		</div>

		<div
			role="tabpanel"
			id="{uid}-panel-create"
			aria-labelledby="{uid}-tab-create"
			hidden={tab !== 'create'}
		>
			<form
				class="flex flex-col gap-5"
				onsubmit={(e) => {
					e.preventDefault();
					create();
				}}
			>
				<div class="flex items-center gap-4">
					<div
						class="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-card text-2xl font-semibold text-text-label"
					>
						{#if iconPreview}
							<img src={iconPreview} alt="Server icon preview" class="h-full w-full object-cover" />
						{:else if name.trim()}
							{name.trim()[0].toUpperCase()}
						{:else}
							<ImagePlus size={24} strokeWidth={1.5} class="text-text-subtle" />
						{/if}
					</div>
					<div class="flex flex-col gap-1.5">
						<div class="flex gap-2">
							<Button
								variant="secondary"
								size="sm"
								class="border border-input"
								aria-describedby="{uid}-icon-hint"
								onclick={() => fileInput?.click()}
							>
								{iconFile ? 'Change icon' : 'Add icon'}
							</Button>
							{#if iconFile}
								<Button variant="ghost" size="sm" onclick={() => setIcon(null)}>Remove</Button>
							{/if}
						</div>
						<input
							bind:this={fileInput}
							type="file"
							accept={ICON_TYPES.join(',')}
							class="hidden"
							tabindex="-1"
							aria-label="Server icon file"
							onchange={handleFileSelect}
						/>
						{#if iconError}
							<p id="{uid}-icon-hint" class="text-xs text-destructive">{iconError}</p>
						{:else}
							<p id="{uid}-icon-hint" class="text-xs text-text-subtle">
								Optional. PNG, JPG, WebP or GIF, up to 5 MB.
							</p>
						{/if}
					</div>
				</div>

				<SettingsTextField
					id="{uid}-name"
					label="Server name"
					bind:value={name}
					error={nameError}
					oninput={() => (nameError = '')}
					maxlength={100}
				/>

				<Dialog.Footer>
					<Button variant="secondary" onclick={() => handleOpenChange(false)}>Cancel</Button>
					<Button type="submit" disabled={!canCreate}>{creating ? 'Creating…' : 'Create'}</Button>
				</Dialog.Footer>
			</form>
		</div>

		<div
			role="tabpanel"
			id="{uid}-panel-join"
			aria-labelledby="{uid}-tab-join"
			hidden={tab !== 'join'}
		>
			<form
				class="flex flex-col gap-5"
				onsubmit={(e) => {
					e.preventDefault();
					join();
				}}
			>
				<SettingsTextField
					id="{uid}-code"
					label="Invite link or code"
					bind:value={code}
					error={codeError}
					oninput={() => (codeError = '')}
					placeholder="Paste an invite link or code"
				/>

				<Dialog.Footer>
					<Button variant="secondary" onclick={() => handleOpenChange(false)}>Cancel</Button>
					<Button type="submit" disabled={!code.trim()}>Continue</Button>
				</Dialog.Footer>
			</form>
		</div>
	</Dialog.Content>
</Dialog.Root>
