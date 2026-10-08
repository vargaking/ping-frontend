<script lang="ts">
	import { fade } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { phoneState } from '$lib/states/phoneState.svelte';
	import { getServerRoles } from '$lib/requests/servers/getServerRoles';
	import { createRole } from '$lib/requests/servers/createRole';
	import { getErrorMessage } from '$lib/requests/errors';
	import type { Role } from '$lib/types/server.types';
	import { canTouchRole, moveRole } from '$lib/utils/roles';
	import Input from '$lib/components/ui/input/input.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import RoleBadge from './RoleBadge.svelte';
	import RoleEditor from './RoleEditor.svelte';
	import { GripVertical, Lock, Plus } from 'lucide-svelte';

	const serverId = $derived(serversState.selectedServer?.id);
	const roles = $derived(serverId != null ? serversState.roles[serverId] : undefined);
	const isOwner = $derived(serverId != null && serversState.isOwner(serverId));
	const rank = $derived(serverId != null ? serversState.rankIn(serverId) : 0);
	const everyone = $derived(roles?.find((r) => r.is_default));
	const custom = $derived((roles ?? []).filter((r) => !r.is_default));
	const canCreate = $derived(isOwner || rank >= 1);

	let loadError = $state(false);
	let editingId = $state<number | null>(null);
	let newName = $state('');
	let creating = $state(false);
	let dragId = $state<number | null>(null);
	let drop = $state<{ id: number; edge: 'before' | 'after' } | null>(null);

	const editing = $derived(roles?.find((r) => r.id === editingId) ?? null);

	$effect(() => {
		if (serverId != null) load(serverId);
	});

	async function load(id: number) {
		loadError = false;
		try {
			serversState.setRoles(id, await getServerRoles(id));
		} catch (e) {
			console.error('Failed to fetch roles', e);
			if (!serversState.roles[id]) loadError = true;
		}
	}

	const locked = (role: Role) => !canTouchRole(role, rank, isOwner);

	async function add() {
		const name = newName.trim();
		if (serverId == null || !name || creating) return;
		creating = true;
		try {
			const role = await createRole(serverId, name);
			newName = '';
			// Creating shifts every other role up, which the response doesn't carry.
			serversState.setRoles(serverId, await getServerRoles(serverId));
			editingId = role.id;
		} catch (e) {
			toast.error(`Couldn't create the role: ${getErrorMessage(e)}`);
		} finally {
			creating = false;
		}
	}

	function startDrag(e: DragEvent, role: Role) {
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', '');
		}
		dragId = role.id;
	}

	function over(e: DragEvent, role: Role) {
		if (dragId === null || locked(role)) return;
		e.preventDefault();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		drop = { id: role.id, edge: e.clientY < rect.top + rect.height / 2 ? 'before' : 'after' };
	}

	function finishDrop(e: DragEvent) {
		if (serverId != null && dragId !== null && drop) {
			e.preventDefault();
			const ids = custom.map((r) => r.id);
			const next = moveRole(ids, dragId, drop.id, drop.edge);
			if (next.some((id, i) => id !== ids[i])) serversState.setRoleOrder(serverId, next);
		}
		resetDrag();
	}

	function resetDrag() {
		dragId = null;
		drop = null;
	}
</script>

{#snippet row(role: Role)}
	<li class="relative" ondragover={(e) => over(e, role)} ondrop={finishDrop} role="presentation">
		<div
			draggable={!locked(role) && !phoneState.touch}
			ondragstart={(e) => startDrag(e, role)}
			ondragend={resetDrag}
			role="presentation"
			class="flex items-center gap-2 rounded-lg border border-border bg-card p-1.5 {dragId ===
			role.id
				? 'opacity-50'
				: ''}"
		>
			{#if locked(role)}
				<span class="flex h-8 w-6 items-center justify-center text-text-subtle" title="Locked">
					<Lock size={14} strokeWidth={1.75} />
					<span class="sr-only">Locked: at or above your highest role</span>
				</span>
			{:else if role.is_default}
				<span class="w-6"></span>
			{:else if !phoneState.touch}
				<span class="flex h-8 w-6 cursor-grab items-center justify-center text-text-subtle">
					<GripVertical size={16} strokeWidth={1.75} />
				</span>
			{/if}
			<button
				type="button"
				disabled={locked(role)}
				onclick={() => (editingId = role.id)}
				class="flex h-8 min-w-0 flex-1 items-center rounded-md px-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed {locked(
					role
				)
					? 'opacity-60'
					: ''}"
			>
				<RoleBadge name={role.name} color={role.color} />
			</button>
		</div>
		{#if drop?.id === role.id && dragId !== role.id}
			<span
				aria-hidden="true"
				class="pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-primary {drop.edge ===
				'before'
					? '-top-[3px]'
					: '-bottom-[3px]'}"
			></span>
		{/if}
	</li>
{/snippet}

{#if editing}
	{#key editing.id}
		<RoleEditor role={editing} onback={() => (editingId = null)} />
	{/key}
{:else}
	<div
		class="min-h-0 flex-1 overflow-y-auto p-7 scrollbar-stable max-md:p-4"
		in:fade={{ duration: 150 }}
	>
		{#if roles == null && loadError}
			<ErrorState
				title="Couldn’t load roles"
				description="There was a problem reaching the server."
				onRetry={() => serverId != null && load(serverId)}
			/>
		{:else if roles == null}
			<LoadingList rows={3} />
		{:else}
			<div class="flex max-w-xl flex-col gap-6">
				<p class="text-sm text-muted-foreground">
					Roles higher in the list win when a member's roles disagree. {phoneState.touch
						? ''
						: 'Drag to reorder. '}You can only manage roles below your own highest role.
				</p>

				<form
					class="flex items-center gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						add();
					}}
				>
					<Input
						aria-label="New role name"
						placeholder="New role"
						bind:value={newName}
						maxlength={50}
						disabled={!canCreate}
						class="h-9 min-w-[140px] flex-1"
					/>
					<Button type="submit" disabled={!newName.trim() || creating || !canCreate}>
						<Plus size={16} strokeWidth={1.75} />
						Create
					</Button>
				</form>
				{#if !canCreate}
					<p class="-mt-4 text-xs text-text-subtle">
						You need a role of your own before you can create roles.
					</p>
				{/if}

				<ul class="flex flex-col gap-1.5" aria-label="Roles">
					{#each custom as role (role.id)}
						{@render row(role)}
					{:else}
						<li class="text-sm text-text-subtle">No custom roles yet.</li>
					{/each}
					{#if everyone}
						<li class="mt-2">
							<button
								type="button"
								disabled={locked(everyone)}
								onclick={() => (editingId = everyone.id)}
								class="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-1.5 pl-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
							>
								<span class="flex h-8 flex-1 items-center">
									<RoleBadge name={everyone.name} color={null} />
								</span>
								<span class="pr-2 text-xs text-text-subtle">Applies to everyone</span>
							</button>
						</li>
					{/if}
				</ul>
			</div>
		{/if}
	</div>
{/if}
