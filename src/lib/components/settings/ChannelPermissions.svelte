<script lang="ts">
	import { untrack } from 'svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { overwritesState } from '$lib/states/overwritesState.svelte';
	import { CHANNEL_BITS, Permission } from '$lib/permissions';
	import type { OverwriteSubject, OverwriteTarget } from '$lib/types/overwrite.types';
	import type { Role } from '$lib/types/server.types';
	import { canTouchRole, rankOf, sortRoles, type PermissionState } from '$lib/utils/roles';
	import {
		CHANNEL_PERMISSIONS,
		NO_BITS,
		bitState,
		inheritedForMember,
		inheritedForRole,
		rowBits,
		visibilityLine,
		withRow,
		withState,
		type Bits
	} from '$lib/utils/overwrites';
	import {
		canView,
		isPrivate,
		privateRow,
		scopeMask,
		visibleTo,
		type MemberInfo,
		type Scope,
		type Who
	} from '$lib/utils/channelResolution';
	import PermissionToggle from './PermissionToggle.svelte';
	import SettingsSwitch from './SettingsSwitch.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Trash2 } from 'lucide-svelte';

	const VIEW = Permission.VIEW_CHANNEL;

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
	let addRole = $state('');
	let addMember = $state('');

	const roles = $derived(serversState.roles[serverId] ?? []);
	const everyone = $derived(roles.find((r) => r.is_default));
	const everyoneSubject = $derived<OverwriteSubject | null>(
		everyone ? { kind: 'roles', id: everyone.id } : null
	);
	const ownerId = $derived(serversState.servers[serverId]?.owner_id ?? null);
	const isOwner = $derived(serversState.isOwner(serverId));
	const rank = $derived(serversState.rankIn(serverId));
	const me = $derived(usersState.loggedInUser?.id ?? null);
	const actor = $derived<Who>({
		userId: me,
		roleIds: me != null ? (serversState.memberRoles[serverId]?.[me] ?? []) : []
	});
	const noun = $derived(targetKind === 'channel' ? 'channel' : 'category');
	const ready = $derived(hereReady && parentReady && serversState.roles[serverId] != null);

	const members = $derived<MemberInfo[]>(
		(serversState.servers[serverId]?.members ?? []).map((user) => ({
			id: user.id,
			username: usersState.users[user.id]?.username ?? user.username,
			roleIds: serversState.memberRoles[serverId]?.[user.id] ?? []
		}))
	);

	const categoryName = $derived(
		parentId != null ? (serversState.channelGroups[serverId]?.[parentId]?.name ?? '') : ''
	);
	const scope = $derived<Scope | null>(
		rows && (!parent || parentRows)
			? {
					roles,
					ownerId,
					target: rows,
					category: parent && parentRows ? { name: categoryName, rows: parentRows } : null
				}
			: null
	);

	const privateOn = $derived(scope ? isPrivate(scope) : false);
	const privatePending = $derived(
		everyoneSubject != null && (overwritesState.pendingBits(here, everyoneSubject) & VIEW) !== 0n
	);
	const statusLine = $derived.by(() => {
		if (!scope) return '';
		const visible = privateOn ? visibleTo(scope, members) : null;
		const names = visible
			? [...visible.roles.map((r) => r.name), ...visible.members.map((m) => m.username)]
			: [];
		return visibilityLine(noun, privateOn, names);
	});
	const privateHint = $derived.by(() => {
		if (!scope || !privateOn || !everyoneSubject) return null;
		if (bitState(rowBits(scope.target, everyoneSubject), VIEW) === 'deny') return null;
		if (!isPrivate({ ...scope, category: null })) {
			return `Private because the category ${categoryName} is private.`;
		}
		return "Private because @everyone can't view channels in this server.";
	});

	const actorMask = $derived(scope ? scopeMask(scope, actor) : 0n);

	function losesView(subject: OverwriteSubject, next: Bits): boolean {
		if (isOwner || !scope) return false;
		return !canView({ ...scope, target: withRow(scope.target, subject, next) }, actor);
	}

	function lacksBits(changed: bigint): boolean {
		return !isOwner && (changed & ~actorMask) !== 0n;
	}

	const everyoneLocked = $derived(everyone != null && !canTouchRole(everyone, rank, isOwner));
	const switchNote = $derived.by(() => {
		if (!scope || !everyone || !everyoneSubject) return null;
		if (everyoneLocked) return "You can't change @everyone, so you can't change this.";
		if (privateOn || !losesView(everyoneSubject, privateRow(scope, everyone.id, true))) return null;
		return `Turning this on would take this ${noun} away from you. Allow View for one of your roles or for yourself below first.`;
	});

	type Entry = {
		subject: OverwriteSubject;
		label: string;
		role?: Role;
		locked: boolean;
		lockedNote: string;
	};

	const entries = $derived.by<Entry[]>(() => {
		const subjects: OverwriteSubject[] = [
			...(rows?.roles ?? []).map((r) => ({ kind: 'roles' as const, id: r.role_id })),
			...(rows?.members ?? []).map((m) => ({ kind: 'members' as const, id: m.user_id })),
			...added,
			...(everyoneSubject ? [everyoneSubject] : [])
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
				out.push({
					subject,
					label: role.name,
					role,
					locked: !canTouchRole(role, rank, isOwner),
					lockedNote: "This is at or above your highest role, so you can't change it."
				});
			} else {
				const member = members.find((m) => m.id === subject.id);
				out.push({
					subject,
					label: member?.username ?? `User ${subject.id}`,
					locked: memberLocked(subject.id, member?.roleIds ?? []),
					lockedNote: "Their highest role is at or above yours, so you can't change this."
				});
			}
		}
		const order = (e: Entry) => (e.role ? -e.role.position : 1);
		return out.sort((a, b) => order(a) - order(b));
	});

	function memberLocked(userId: number, roleIds: number[]): boolean {
		if (isOwner) return false;
		const theirRank = rankOf(roles, roleIds);
		return userId === ownerId || (theirRank > 0 && theirRank >= rank);
	}

	const roleChoices = $derived(
		sortRoles(roles).filter(
			(r) =>
				canTouchRole(r, rank, isOwner) &&
				!entries.some((e) => e.subject.kind === 'roles' && e.subject.id === r.id)
		)
	);
	const memberChoices = $derived(
		members.filter(
			(m) =>
				m.id !== ownerId &&
				!memberLocked(m.id, m.roleIds) &&
				!entries.some((e) => e.subject.kind === 'members' && e.subject.id === m.id)
		)
	);

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

	function change(entry: Entry, bit: bigint, state: PermissionState) {
		const next = withState(rowBits(rows, entry.subject), bit, state);
		if (entry.locked || lacksBits(bit)) return;
		if (bit === VIEW && losesView(entry.subject, next)) return;
		void overwritesState.save(here, entry.subject, next, bit);
	}

	function removeNote(entry: Entry): string | null {
		if (entry.locked) return null;
		const bits = rowBits(rows, entry.subject);
		if (losesView(entry.subject, NO_BITS)) {
			return `Removing this would take this ${noun} away from you.`;
		}
		if (lacksBits(bits.allow | bits.deny)) {
			return "It sets permissions you don't have, so you can't remove it.";
		}
		return null;
	}

	function remove(entry: Entry) {
		if (entry.locked || removeNote(entry)) return;
		added = added.filter((s) => !(s.kind === entry.subject.kind && s.id === entry.subject.id));
		void overwritesState.save(here, entry.subject, NO_BITS, CHANNEL_BITS);
	}

	function add(kind: 'roles' | 'members', value: string) {
		if (!value) return;
		added = [...added, { kind, id: Number(value) }];
		addRole = '';
		addMember = '';
	}

	function togglePrivate() {
		if (!scope || !everyone || !everyoneSubject || switchNote) return;
		const next = privateRow(scope, everyone.id, !privateOn);
		void overwritesState.save(here, everyoneSubject, next, VIEW);
	}

	const stateLabel: Record<PermissionState, string> = {
		inherit: 'Inherit',
		allow: 'Allow',
		deny: 'Deny'
	};

	function availability(entry: Entry, bits: Bits, bit: bigint) {
		const open = { disabled: false, blocked: [] as PermissionState[], note: undefined };
		if (entry.locked) return { ...open, disabled: true };
		if (lacksBits(bit)) {
			return {
				...open,
				disabled: true,
				note: "You don't have this permission here, so you can't change it."
			};
		}
		if (bit !== VIEW) return open;
		const blocked = (['inherit', 'deny'] as const).filter((state) =>
			losesView(entry.subject, withState(bits, VIEW, state))
		);
		if (blocked.length === 0) return open;
		const names = blocked.map((state) => stateLabel[state]).join(' or ');
		return { ...open, blocked, note: `${names} would take this ${noun} away from you.` };
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
	{:else if !ready || !scope}
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
				disabled={!everyone || switchNote != null}
				onclick={togglePrivate}
			>
				<span class="text-xs text-text-subtle" aria-live="polite">{statusLine}</span>
				{#if privateHint}
					<span class="text-xs text-text-subtle">{privateHint}</span>
				{/if}
				{#if switchNote}
					<span class="text-xs text-muted-foreground">{switchNote}</span>
				{/if}
			</SettingsSwitch>
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

			{#each entries as entry (`${entry.subject.kind}:${entry.subject.id}`)}
				{@const bits = rowBits(scope.target, entry.subject)}
				{@const blockedRemoval = removeNote(entry)}
				<details
					class="rounded-xl border border-input bg-card"
					open={entry.role?.is_default === true ||
						added.some((s) => s.kind === entry.subject.kind && s.id === entry.subject.id)}
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
						{#if !entry.locked && !entry.role?.is_default}
							<Button
								variant="ghost"
								size="sm"
								aria-label="Remove {entry.label}"
								disabled={blockedRemoval != null}
								onclick={(e: MouseEvent) => {
									e.preventDefault();
									remove(entry);
								}}
							>
								<Trash2 size={14} strokeWidth={1.75} />
							</Button>
						{/if}
					</summary>
					<div class="flex flex-col gap-4 border-t border-input px-4 py-4">
						{#if entry.locked}
							<p class="text-xs text-muted-foreground">{entry.lockedNote}</p>
						{/if}
						{#each CHANNEL_PERMISSIONS as permission (permission.bit)}
							{@const available = availability(entry, bits, permission.bit)}
							<PermissionToggle
								label={permission.label}
								description={permission.description}
								value={bitState(bits, permission.bit)}
								inherited={inherited(entry, permission.bit)}
								pending={(overwritesState.pendingBits(here, entry.subject) & permission.bit) !== 0n}
								disabled={available.disabled}
								blocked={available.blocked}
								note={available.note}
								onchange={(state) => change(entry, permission.bit, state)}
							/>
						{/each}
						{#if blockedRemoval}
							<p class="text-xs text-muted-foreground">{blockedRemoval}</p>
						{/if}
					</div>
				</details>
			{/each}
		</section>
	{/if}
</div>
