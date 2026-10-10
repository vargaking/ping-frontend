<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { overwritesState } from '$lib/states/overwritesState.svelte';
	import { CHANNEL_BITS } from '$lib/permissions';
	import type { OverwriteSubject, OverwriteTarget } from '$lib/types/overwrite.types';
	import type { Role } from '$lib/types/server.types';
	import { canTouchRole, rankOf, sortRoles, type PermissionState } from '$lib/utils/roles';
	import {
		CHANNEL_PERMISSIONS,
		NO_BITS,
		bitState,
		inheritedForMember,
		inheritedForRole,
		isPrivate,
		privateSteps,
		rowBits,
		withState
	} from '$lib/utils/overwrites';
	import PermissionToggle from './PermissionToggle.svelte';
	import SettingsSwitch from './SettingsSwitch.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Trash2 } from 'lucide-svelte';

	let {
		serverId,
		target,
		/** For a channel in a category: the category, whose rows it inherits. */
		categoryId = null
	}: { serverId: number; target: OverwriteTarget; categoryId?: number | null } = $props();

	// Only the primitives drive loading, so a new target object with the same ids reloads nothing.
	const targetKind = $derived(target.kind);
	const targetId = $derived(target.id);
	const parentId = $derived(targetKind === 'channel' ? (categoryId ?? null) : null);
	const here = $derived<OverwriteTarget>({ kind: targetKind, id: targetId });
	const parent = $derived<OverwriteTarget | null>(
		parentId != null ? { kind: 'group', id: parentId } : null
	);

	const rows = $derived(overwritesState.rows(here));
	const parentRows = $derived(parent ? overwritesState.rows(parent) : null);

	let hereReady = $state(false);
	let parentReady = $state(false);
	let loadError = $state(false);
	let hereSeq = 0;
	let parentSeq = 0;
	// Subjects added in the editor that don't have a row yet.
	let added = $state<OverwriteSubject[]>([]);
	let keeper = $state('');
	let addRole = $state('');
	let addMember = $state('');

	const roles = $derived(serversState.roles[serverId] ?? []);
	const everyone = $derived(roles.find((r) => r.is_default));
	const ownerId = $derived(serversState.servers[serverId]?.owner_id ?? null);
	const isOwner = $derived(serversState.isOwner(serverId));
	const rank = $derived(serversState.rankIn(serverId));
	const privateOn = $derived(isPrivate(rows, everyone?.id));
	const privatePending = $derived(
		everyone != null &&
			(overwritesState.pendingBits(here, { kind: 'roles', id: everyone.id }) &
				CHANNEL_PERMISSIONS[0].bit) !==
				0n
	);
	const nounTarget = $derived(targetKind === 'channel' ? 'channel' : 'category');
	const ready = $derived(hereReady && parentReady && serversState.roles[serverId] != null);

	type MemberInfo = { id: number; username: string; roleIds: number[] };

	const members = $derived<MemberInfo[]>(
		(serversState.servers[serverId]?.members ?? []).map((user) => ({
			id: user.id,
			username: usersState.users[user.id]?.username ?? user.username,
			roleIds: serversState.memberRoles[serverId]?.[user.id] ?? []
		}))
	);

	type Entry = { subject: OverwriteSubject; label: string; role?: Role; locked: boolean };

	const entries = $derived.by<Entry[]>(() => {
		const subjects: OverwriteSubject[] = [
			...(rows?.roles ?? []).map((r) => ({ kind: 'roles' as const, id: r.role_id })),
			...(rows?.members ?? []).map((m) => ({ kind: 'members' as const, id: m.user_id })),
			...added
		];
		const seen = new Set<string>();
		const out: Entry[] = [];
		for (const subject of subjects) {
			const key = `${subject.kind}:${subject.id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			if (subject.kind === 'roles') {
				const role = roles.find((r) => r.id === subject.id);
				if (!role) continue;
				out.push({ subject, label: role.name, role, locked: !canTouchRole(role, rank, isOwner) });
			} else {
				const member = members.find((m) => m.id === subject.id);
				const theirRank = rankOf(roles, member?.roleIds ?? []);
				out.push({
					subject,
					label: member?.username ?? `User ${subject.id}`,
					locked: !isOwner && (subject.id === ownerId || (theirRank > 0 && theirRank >= rank))
				});
			}
		}
		const order = (e: Entry) => (e.role ? -e.role.position : 1);
		return out.sort((a, b) => order(a) - order(b));
	});

	const roleChoices = $derived(
		sortRoles(roles).filter(
			(r) => !entries.some((e) => e.subject.kind === 'roles' && e.subject.id === r.id)
		)
	);
	const memberChoices = $derived(
		members.filter(
			(m) => !entries.some((e) => e.subject.kind === 'members' && e.subject.id === m.id)
		)
	);
	const keeperChoices = $derived([
		...sortRoles(roles)
			.filter((r) => !r.is_default && canTouchRole(r, rank, isOwner))
			.map((r) => ({ value: `roles:${r.id}`, label: r.name })),
		...members.map((m) => ({ value: `members:${m.id}`, label: m.username }))
	]);

	async function loadHere(t: OverwriteTarget) {
		const seq = ++hereSeq;
		hereReady = false;
		loadError = false;
		try {
			await Promise.all([
				overwritesState.load(t),
				serversState.roles[serverId] ? null : serversState.loadRoster(serverId)
			]);
			if (seq === hereSeq) hereReady = true;
		} catch (e) {
			if (seq !== hereSeq) return;
			console.warn('Failed to load permission overwrites', e);
			loadError = true;
		}
	}

	async function loadParent(p: OverwriteTarget | null) {
		const seq = ++parentSeq;
		if (!p) {
			parentReady = true;
			return;
		}
		parentReady = false;
		try {
			await overwritesState.load(p);
			if (seq === parentSeq) parentReady = true;
		} catch (e) {
			if (seq !== parentSeq) return;
			console.warn('Failed to load category permission overwrites', e);
			loadError = true;
		}
	}

	$effect(() => {
		const t = here;
		untrack(() => loadHere(t));
	});

	$effect(() => {
		const p = parent;
		untrack(() => loadParent(p));
	});

	function retry() {
		loadError = false;
		void loadHere(here);
		void loadParent(parent);
	}

	function parseSubject(value: string): OverwriteSubject | null {
		const [kind, id] = value.split(':');
		if ((kind !== 'roles' && kind !== 'members') || !id) return null;
		return { kind, id: Number(id) };
	}

	function change(subject: OverwriteSubject, bit: bigint, state: PermissionState) {
		const next = withState(rowBits(rows, subject), bit, state);
		void overwritesState.save(here, subject, next, bit);
	}

	function remove(subject: OverwriteSubject) {
		added = added.filter((s) => !(s.kind === subject.kind && s.id === subject.id));
		void overwritesState.save(here, subject, NO_BITS, CHANNEL_BITS);
	}

	function add(kind: 'roles' | 'members', value: string) {
		if (!value) return;
		added = [...added, { kind, id: Number(value) }];
		addRole = '';
		addMember = '';
	}

	async function togglePrivate() {
		if (!everyone) return;
		const view = CHANNEL_PERMISSIONS[0].bit;
		const everyoneSubject: OverwriteSubject = { kind: 'roles', id: everyone.id };
		if (privateOn) {
			const bits = withState(rowBits(rows, everyoneSubject), view, 'inherit');
			void overwritesState.save(here, everyoneSubject, bits, view);
			return;
		}
		const subject = parseSubject(keeper);
		if (!subject) {
			toast.error(`Pick who keeps access to this ${nounTarget} first.`);
			return;
		}
		keeper = '';
		const [keep] = privateSteps(rows, everyone.id, subject);
		if (!(await overwritesState.save(here, keep.subject, keep.bits, view))) return;
		const [, hide] = privateSteps(rows, everyone.id, subject);
		void overwritesState.save(here, hide.subject, hide.bits, view);
	}

	function inherited(entry: Entry, bit: bigint): string {
		if (entry.role) return inheritedForRole(entry.role, bit, roles, rows, parentRows);
		return inheritedForMember(parentRows != null);
	}

	const selectClass =
		'h-10 min-w-0 flex-1 rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
</script>

<div class="flex flex-col gap-6 p-7 max-md:p-4" data-testid="channel-permissions">
	{#if loadError}
		<p class="text-sm text-destructive">
			Couldn't load the permissions. <button class="underline" onclick={retry}>Try again</button>
		</p>
	{:else if !ready || rows === null}
		<p class="text-sm text-muted-foreground">Loading…</p>
	{:else}
		<section class="flex flex-col gap-3">
			<SettingsSwitch
				label="Private"
				description={targetKind === 'channel'
					? 'Only the roles and members you allow can see this channel.'
					: 'Only the roles and members you allow can see the channels in this category.'}
				checked={privateOn}
				pending={privatePending}
				disabled={!everyone}
				onclick={togglePrivate}
			/>
			{#if !privateOn}
				<div class="flex max-w-md flex-col gap-1.5">
					<label for="private-keeper" class="text-[13px] font-medium text-text-label">
						Who keeps access
					</label>
					<select id="private-keeper" bind:value={keeper} class={selectClass}>
						<option value="">Pick a role or member</option>
						{#each keeperChoices as choice (choice.value)}
							<option value={choice.value}>{choice.label}</option>
						{/each}
					</select>
				</div>
			{/if}
		</section>

		<section class="flex flex-col gap-3">
			<h3 class="text-sm font-semibold">Roles and members</h3>
			<div class="flex gap-2 max-md:flex-col">
				<select
					aria-label="Add a role"
					bind:value={addRole}
					onchange={() => add('roles', addRole)}
					class={selectClass}
				>
					<option value="">Add a role…</option>
					{#each roleChoices as role (role.id)}
						<option value={String(role.id)}>{role.name}</option>
					{/each}
				</select>
				<select
					aria-label="Add a member"
					bind:value={addMember}
					onchange={() => add('members', addMember)}
					class={selectClass}
				>
					<option value="">Add a member…</option>
					{#each memberChoices as member (member.id)}
						<option value={String(member.id)}>{member.username}</option>
					{/each}
				</select>
			</div>

			{#if entries.length === 0}
				<p class="text-sm text-muted-foreground">
					Nothing is set for this {nounTarget}. Everyone has their server permissions here.
				</p>
			{/if}

			{#each entries as entry (`${entry.subject.kind}:${entry.subject.id}`)}
				{@const bits = rowBits(rows, entry.subject)}
				<details
					class="rounded-xl border border-input bg-card"
					open={added.some((s) => s.kind === entry.subject.kind && s.id === entry.subject.id)}
				>
					<summary
						class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium"
					>
						<span class="truncate">
							{entry.label}
							<span class="ml-1 text-xs font-normal text-muted-foreground">
								{entry.subject.kind === 'roles' ? 'Role' : 'Member'}
							</span>
						</span>
						{#if !entry.locked}
							<Button
								variant="ghost"
								size="sm"
								aria-label="Remove {entry.label}"
								onclick={(e: MouseEvent) => {
									e.preventDefault();
									remove(entry.subject);
								}}
							>
								<Trash2 size={14} strokeWidth={1.75} />
							</Button>
						{/if}
					</summary>
					<div class="flex flex-col gap-4 border-t border-input px-4 py-4">
						{#if entry.locked}
							<p class="text-xs text-muted-foreground">
								This is at or above your highest role, so you can't change it.
							</p>
						{/if}
						{#each CHANNEL_PERMISSIONS as permission (permission.bit)}
							<PermissionToggle
								label={permission.label}
								description={permission.description}
								value={bitState(bits, permission.bit)}
								inherited={inherited(entry, permission.bit)}
								pending={(overwritesState.pendingBits(here, entry.subject) & permission.bit) !== 0n}
								disabled={entry.locked}
								onchange={(state) => change(entry.subject, permission.bit, state)}
							/>
						{/each}
					</div>
				</details>
			{/each}
		</section>
	{/if}
</div>
