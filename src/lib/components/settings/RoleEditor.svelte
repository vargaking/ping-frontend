<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { PERMISSION_GROUPS, parseMask } from '$lib/permissions';
	import { updateRole, type RoleUpdate } from '$lib/requests/servers/updateRole';
	import { deleteRole } from '$lib/requests/servers/deleteRole';
	import { fieldErrorsFrom, getErrorMessage } from '$lib/requests/errors';
	import type { Role } from '$lib/types/server.types';
	import {
		canTouchRole,
		inheritedSource,
		resolveRole,
		wouldCycle,
		type PermissionState
	} from '$lib/utils/roles';
	import { TAG_COLORS } from '$lib/utils/forum';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Button from '$lib/components/ui/button/button.svelte';
	import SettingsForm from './SettingsForm.svelte';
	import SettingsTextField from './SettingsTextField.svelte';
	import SettingsSwitch from './SettingsSwitch.svelte';
	import PermissionToggle from './PermissionToggle.svelte';
	import { ArrowLeft } from 'lucide-svelte';

	let { role, onback }: { role: Role; onback: () => void } = $props();

	const serverId = $derived(serversState.selectedServer?.id);
	const roles = $derived(serverId != null ? (serversState.roles[serverId] ?? []) : []);
	const myMask = $derived(serverId != null ? serversState.maskOf(serverId) : 0n);
	const locked = $derived(
		serverId == null ||
			!canTouchRole(role, serversState.rankIn(serverId), serversState.isOwner(serverId))
	);

	let name = $state(role.name);
	let color = $state<string | null>(role.color);
	let parentId = $state<number | null>(role.parent_id);
	let allow = $state(parseMask(role.allow));
	let deny = $state(parseMask(role.deny));
	let saving = $state(false);
	let nameError = $state('');
	let confirmDelete = $state(false);
	let deleting = $state(false);

	const dirty = $derived(
		name.trim() !== role.name ||
			color !== role.color ||
			parentId !== role.parent_id ||
			allow !== parseMask(role.allow) ||
			deny !== parseMask(role.deny)
	);

	// Inheritance previews against the parent being picked, not the saved one.
	const draft = $derived<Role>({ ...role, parent_id: parentId });
	const parents = $derived(roles.filter((r) => !r.is_default && r.id !== role.id));

	function parentProblem(parent: Role): string | null {
		if (wouldCycle(role.id, parent.id, roles)) return 'would loop';
		if (resolveRole(parent.id, roles).allow & ~myMask) return 'has permissions you lack';
		return null;
	}

	function stateOf(bit: bigint): PermissionState {
		return deny & bit ? 'deny' : allow & bit ? 'allow' : 'inherit';
	}

	function setState(bit: bigint, next: PermissionState) {
		allow = next === 'allow' ? allow | bit : allow & ~bit;
		deny = next === 'deny' ? deny | bit : deny & ~bit;
	}

	function inheritedText(bit: bigint): string {
		const source = inheritedSource(draft, bit, roles);
		if (!source) return 'Not set';
		return `${source.state === 'allow' ? 'Allowed' : 'Denied'}, from ${source.role.name}`;
	}

	function reset() {
		name = role.name;
		color = role.color;
		parentId = role.parent_id;
		allow = parseMask(role.allow);
		deny = parseMask(role.deny);
		nameError = '';
	}

	async function save() {
		if (serverId == null || locked) return;
		const trimmed = name.trim();
		if (!trimmed) {
			nameError = 'Give the role a name.';
			return;
		}
		const update: RoleUpdate = {};
		if (trimmed !== role.name) update.name = trimmed;
		if (color !== role.color) update.color = color;
		if (parentId !== role.parent_id) update.parent_id = parentId;
		if (allow !== parseMask(role.allow)) update.allow = String(allow);
		if (deny !== parseMask(role.deny)) update.deny = String(deny);
		saving = true;
		nameError = '';
		try {
			serversState.upsertRole(serverId, await updateRole(serverId, role.id, update));
			toast.success(`Saved ${trimmed}`);
		} catch (e) {
			const message = getErrorMessage(e);
			if (fieldErrorsFrom(e).name || /name/i.test(message)) nameError = message;
			toast.error(`Couldn't save the role: ${message}`);
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (serverId == null || deleting) return;
		deleting = true;
		try {
			await deleteRole(serverId, role.id);
		} catch (e) {
			toast.error(`Couldn't delete the role: ${getErrorMessage(e)}`);
			deleting = false;
			return;
		}
		toast.success(`Deleted ${role.name}`);
		serversState.removeRole(serverId, role.id);
		onback();
	}

	const selectClass =
		'h-11 w-full rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50';
</script>

<SettingsForm {dirty} {saving} onsave={save} onreset={reset}>
	<div class="flex max-w-xl flex-col gap-7">
		<button
			type="button"
			onclick={onback}
			class="flex w-fit items-center gap-1.5 rounded-md text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<ArrowLeft size={14} strokeWidth={1.75} />
			All roles
		</button>

		{#if locked}
			<p class="text-sm text-muted-foreground" role="status">
				This role is at or above your highest role, so you can't change it.
			</p>
		{/if}

		<fieldset disabled={locked} class="flex flex-col gap-7">
			<SettingsTextField
				id="role-name"
				label="Name"
				bind:value={name}
				maxlength={50}
				error={nameError}
				oninput={() => (nameError = '')}
			/>
			{#if role.is_default}
				<p class="-mt-4 text-xs text-text-subtle">
					Everyone in the server has this role, so it can't be renamed, coloured or denied.
				</p>
			{:else}
				<div class="flex flex-col gap-1.5">
					<span class="text-[13px] font-medium text-text-label" id="role-color-label">Colour</span>
					<div
						class="flex flex-wrap items-center gap-2"
						role="group"
						aria-labelledby="role-color-label"
					>
						<button
							type="button"
							aria-pressed={color === null}
							onclick={() => (color = null)}
							class="h-7 rounded-full border border-input px-3 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-8 {color ===
							null
								? 'bg-accent text-foreground'
								: ''}"
						>
							None
						</button>
						{#each TAG_COLORS as swatch (swatch)}
							<button
								type="button"
								aria-label={swatch}
								aria-pressed={color === swatch}
								onclick={() => (color = swatch)}
								style:background-color={swatch}
								class="h-5 w-5 rounded-full ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-8 pointer-coarse:w-8 {color ===
								swatch
									? 'ring-2 ring-foreground'
									: ''}"
							></button>
						{/each}
						<input
							type="color"
							aria-label="Custom colour"
							value={color ?? '#5b8def'}
							oninput={(e) => (color = e.currentTarget.value)}
							class="h-7 w-9 cursor-pointer rounded-md border border-input bg-transparent p-0.5 pointer-coarse:h-8"
						/>
					</div>
				</div>

				<div class="flex max-w-md flex-col gap-1.5">
					<label for="role-parent" class="text-[13px] font-medium text-text-label">
						Inherits from
					</label>
					<select
						id="role-parent"
						class={selectClass}
						value={parentId === null ? '' : String(parentId)}
						onchange={(e) =>
							(parentId = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
					>
						<option value="">Nothing</option>
						{#each parents as parent (parent.id)}
							{@const problem = parentProblem(parent)}
							<option
								value={String(parent.id)}
								disabled={problem != null && parent.id !== parentId}
							>
								{parent.name}{problem ? ` (${problem})` : ''}
							</option>
						{/each}
					</select>
					<p class="text-xs text-text-subtle">
						Permissions this role leaves on Inherit come from its parent.
					</p>
				</div>
			{/if}

			{#each PERMISSION_GROUPS as group (group.label)}
				<section class="flex flex-col gap-4" aria-label={group.label}>
					<h3
						class="border-b border-border pb-2 text-xs font-medium tracking-[0.02em] text-text-subtle"
					>
						{group.label}
					</h3>
					{#each group.permissions as perm (perm.bit)}
						{@const unheld = (myMask & perm.bit) !== perm.bit}
						{#if role.is_default}
							<SettingsSwitch
								label={perm.label}
								description={perm.description}
								checked={Boolean(allow & perm.bit)}
								disabled={locked || unheld}
								onclick={() => setState(perm.bit, allow & perm.bit ? 'inherit' : 'allow')}
							/>
						{:else}
							<PermissionToggle
								label={perm.label}
								description={perm.description}
								value={stateOf(perm.bit)}
								inherited={inheritedText(perm.bit)}
								disabled={locked || unheld}
								onchange={(next) => setState(perm.bit, next)}
							/>
						{/if}
					{/each}
				</section>
			{/each}
		</fieldset>

		{#if !role.is_default && !locked}
			<section
				aria-label="Delete role"
				class="flex items-center gap-4 rounded-xl border border-destructive-border p-4 max-md:flex-col max-md:items-stretch max-md:gap-3"
			>
				<p class="flex-1 text-[13px] text-muted-foreground">
					Deleting this role removes it from everyone who has it. Roles inheriting from it lose
					their parent.
				</p>
				<Button
					variant="secondary"
					class="border border-destructive-border bg-transparent text-destructive hover:bg-destructive/10"
					onclick={() => (confirmDelete = true)}
				>
					Delete role
				</Button>
			</section>
		{/if}
	</div>
</SettingsForm>

<Dialog.Root
	open={confirmDelete}
	onOpenChange={(open) => {
		if (!deleting) confirmDelete = open;
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete {role.name}?</Dialog.Title>
			<Dialog.Description>
				Members lose this role and what it gave them right away. This can't be undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="secondary" onclick={() => (confirmDelete = false)}>Cancel</Button>
			<Button
				class="border border-destructive-border bg-transparent text-destructive hover:bg-destructive/10"
				disabled={deleting}
				onclick={remove}
			>
				{deleting ? 'Deleting…' : 'Delete'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
