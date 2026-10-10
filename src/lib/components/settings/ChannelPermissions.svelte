<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
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
		memberInheritedText,
		roleInheritedText,
		rowBits,
		rowSummary,
		visibilityLine,
		withRow,
		withState,
		type Bits,
		type Place
	} from '$lib/utils/overwrites';
	import {
		canView,
		inheritedForMember,
		inheritedForRole,
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
	import { ChevronRight, Trash2 } from 'lucide-svelte';

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
	// Open state is only ever changed by the user (header click, key press, adding a row).
	const openRows = new SvelteSet<string>();
	// Rows the user added or changed in this tab stay listed even when the server empties them.
	const shown = new SvelteSet<string>();
	let everyoneOpened = false;
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

	const place = $derived<Place>({
		noun,
		categoryName: parentId != null ? categoryName || null : null
	});

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
		return `Turning this on would take this ${noun} away from you. Allow View for one of your lower roles first, or ask someone above you.`;
	});

	type Entry = {
		key: string;
		subject: OverwriteSubject;
		label: string;
		kindLabel: string;
		role?: Role;
		member?: MemberInfo;
		locked: boolean;
		lockedNote: string;
	};

	const rowKey = (subject: OverwriteSubject) => `${subject.kind}:${subject.id}`;

	function subjectOfKey(key: string): OverwriteSubject {
		const [kind, id] = key.split(':');
		return { kind: kind as OverwriteSubject['kind'], id: Number(id) };
	}

	const entries = $derived.by<Entry[]>(() => {
		const subjects: OverwriteSubject[] = [
			...(rows?.roles ?? []).map((r) => ({ kind: 'roles' as const, id: r.role_id })),
			...(rows?.members ?? []).map((m) => ({ kind: 'members' as const, id: m.user_id })),
			...[...shown].map(subjectOfKey),
			...(everyoneSubject ? [everyoneSubject] : [])
		];
		const seen = new Set<string>();
		const out: Entry[] = [];
		for (const subject of subjects) {
			const key = rowKey(subject);
			if (seen.has(key)) continue;
			seen.add(key);
			if (subject.kind === 'roles') {
				const role = roles.find((r) => r.id === subject.id);
				if (!role) continue;
				const parentRole = roles.find((r) => r.id === role.parent_id);
				out.push({
					key,
					subject,
					label: role.name,
					kindLabel: parentRole ? `inherits from ${parentRole.name}` : 'Role',
					role,
					locked: !canTouchRole(role, rank, isOwner),
					lockedNote: "This is at or above your highest role, so you can't change it."
				});
			} else {
				const member = members.find((m) => m.id === subject.id);
				if (!member) continue;
				out.push({
					key,
					subject,
					label: member.username,
					kindLabel: 'Member',
					member,
					locked: memberLocked(member.id, member.roleIds),
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

	// The @everyone row starts open because it is the setting the Private switch mirrors.
	function openEveryoneOnce() {
		if (everyoneOpened || !everyoneSubject) return;
		everyoneOpened = true;
		openRows.add(rowKey(everyoneSubject));
	}

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
			openEveryoneOnce();
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
		shown.add(entry.key);
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
		shown.delete(entry.key);
		void overwritesState.save(here, entry.subject, NO_BITS, CHANNEL_BITS);
	}

	function add(kind: 'roles' | 'members', value: string) {
		if (!value) return;
		const key = rowKey({ kind, id: Number(value) });
		shown.add(key);
		openRows.add(key);
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

	function inherited(entry: Entry, bit: bigint): { value: 'allow' | 'deny'; text: string } {
		if (!scope) return { value: 'deny', text: '' };
		if (entry.member) {
			const decided = inheritedForMember(scope, entry.member, bit);
			return { value: decided.value, text: memberInheritedText(decided, place) };
		}
		const role = entry.role!;
		const decided = inheritedForRole(scope, role, bit);
		return { value: decided.value, text: roleInheritedText(role, decided, place) };
	}

	function cannotSee(entry: Entry): boolean {
		if (!scope) return false;
		const who: Who = entry.member
			? { userId: entry.member.id, roleIds: entry.member.roleIds }
			: { userId: null, roleIds: entry.role?.is_default ? [] : [entry.subject.id] };
		return !canView(scope, who);
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

			{#each entries as entry (entry.key)}
				{@const bits = rowBits(scope.target, entry.subject)}
				{@const blockedRemoval = removeNote(entry)}
				<details
					class="group min-w-0 rounded-xl border border-input bg-card"
					bind:open={
						() => openRows.has(entry.key),
						(open) => (open ? openRows.add(entry.key) : openRows.delete(entry.key))
					}
				>
					<summary
						class="flex cursor-pointer list-none items-start gap-2 rounded-xl px-4 py-3 text-sm group-open:rounded-b-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden"
					>
						<ChevronRight
							size={16}
							class="mt-0.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
							aria-hidden="true"
						/>
						<span
							class="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-baseline md:justify-between md:gap-3"
						>
							<span class="min-w-0 font-medium break-words">
								{entry.label}
								<span class="text-xs font-normal text-muted-foreground">· {entry.kindLabel}</span>
							</span>
							<span class="min-w-0 text-xs break-words text-muted-foreground group-open:hidden">
								{rowSummary(bits)}
							</span>
						</span>
					</summary>
					<div class="flex flex-col gap-4 border-t border-input px-4 py-4">
						{#if entry.locked}
							<p class="text-xs text-muted-foreground">{entry.lockedNote}</p>
						{/if}
						{#if cannotSee(entry)}
							<p class="text-xs text-muted-foreground">
								Can't see this {noun}, so the other permissions here have no effect.
							</p>
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
						{#if !entry.locked && !entry.role?.is_default}
							<div class="flex justify-end">
								<Button
									variant="ghost"
									size="sm"
									aria-label="Remove {entry.label}"
									disabled={blockedRemoval != null}
									onclick={() => remove(entry)}
								>
									<Trash2 size={14} strokeWidth={1.75} />
									Remove
								</Button>
							</div>
						{/if}
					</div>
				</details>
			{/each}
		</section>
	{/if}
</div>
