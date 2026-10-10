import { ALL_PERMISSIONS, CHANNEL_BITS, Permission } from '$lib/permissions';
import type { OverwriteSubject, Overwrites } from '$lib/types/overwrite.types';
import type { Role } from '$lib/types/server.types';
import { rowBits, withRow, withState, type Bits } from './overwrites';
import { applyLayer, inheritedSource, memberMask, ownState, sortRoles } from './roles';

export type Scope = {
	roles: Role[];
	ownerId: number | null;
	/** Rows of the channel or category being edited (optimistic). */
	target: Overwrites;
	/** For a channel in a category: the category's name and rows. Null for a category or an ungrouped channel. */
	category: { name: string; rows: Overwrites } | null;
};

/** Someone to resolve for: a member (userId) or, with userId null, "anyone holding exactly these roles". */
export type Who = { userId: number | null; roleIds: number[] };

export type MemberInfo = { id: number; username: string; roleIds: number[] };

const VIEW = Permission.VIEW_CHANNEL;

/** A role as one target sees it: its place in the hierarchy, with that target's row in place of its permissions. */
function overwritten(roles: Role[], rows: Overwrites): Role[] {
	return roles.map((role) => {
		const row = rows.roles.find((r) => r.role_id === role.id);
		return { ...role, allow: row?.allow ?? '0', deny: row?.deny ?? '0' };
	});
}

function overwriteLayer(mask: bigint, roles: Role[], who: Who, rows: Overwrites): bigint {
	if (rows.roles.length > 0) mask = applyLayer(mask, overwritten(roles, rows), who.roleIds);
	if (who.userId != null) {
		const { allow, deny } = rowBits(rows, { kind: 'members', id: who.userId });
		mask = (mask & ~deny) | allow;
	}
	return mask;
}

/** A member's mask in the channel or category, resolved the way the server does. */
export function scopeMask(scope: Scope, who: Who): bigint {
	if (who.userId != null && who.userId === scope.ownerId) return ALL_PERMISSIONS;
	const server = memberMask(scope.roles, who.roleIds);
	let mask = server;
	for (const rows of [scope.category?.rows, scope.target]) {
		if (rows) mask = overwriteLayer(mask, scope.roles, who, rows);
	}
	mask = (server & ~CHANNEL_BITS) | (mask & CHANNEL_BITS);
	if (!(mask & VIEW)) mask &= ~CHANNEL_BITS;
	return mask & ALL_PERMISSIONS;
}

export function canView(scope: Scope, who: Who): boolean {
	return (scopeMask(scope, who) & VIEW) !== 0n;
}

/** Someone with no roles and no member row of their own can't view it. */
export function isPrivate(scope: Scope): boolean {
	return !canView(scope, { userId: null, roleIds: [] });
}

/** Who can see the target besides the owner: roles that can view, and members let in by their own row. */
export function visibleTo(
	scope: Scope,
	members: MemberInfo[]
): { roles: Role[]; members: MemberInfo[] } {
	const roles = sortRoles(
		scope.roles.filter((r) => !r.is_default && canView(scope, { userId: null, roleIds: [r.id] }))
	);
	const allowedByRow = (id: number) =>
		[scope.category?.rows, scope.target].some(
			(rows) => rows && (rowBits(rows, { kind: 'members', id }).allow & VIEW) !== 0n
		);
	return {
		roles,
		members: members.filter(
			(m) =>
				m.id !== scope.ownerId &&
				allowedByRow(m.id) &&
				canView(scope, { userId: m.id, roleIds: m.roleIds })
		)
	};
}

/** The @everyone row that makes the target private (on) or public (off) in one write. */
export function privateRow(scope: Scope, everyoneId: number, on: boolean): Bits {
	const everyone: OverwriteSubject = { kind: 'roles', id: everyoneId };
	const row = rowBits(scope.target, everyone);
	if (on) return withState(row, VIEW, 'deny');
	const inherit = withState(row, VIEW, 'inherit');
	const stillPrivate = isPrivate({ ...scope, target: withRow(scope.target, everyone, inherit) });
	return stillPrivate ? withState(row, VIEW, 'allow') : inherit;
}

export type Layer = 'server' | 'category' | 'target';

export type Source =
	| { kind: 'owner' }
	| { kind: 'none' }
	| { kind: 'everyone'; layer: Layer }
	/** `role` is the assigned role whose opinion it is; `via` is the ancestor that set it, or null when the role set it itself. */
	| { kind: 'role'; layer: Layer; role: Role; via: Role | null }
	| { kind: 'member'; layer: 'category' | 'target' };

export type Decided = { value: 'allow' | 'deny'; source: Source };

function setterOf(
	role: Role,
	roles: Role[],
	bit: bigint
): { role: Role; state: 'allow' | 'deny' } | null {
	const own = ownState(role, bit);
	return own !== 'inherit' ? { role, state: own } : inheritedSource(role, bit, roles);
}

/** The steps of one layer that say something about `bit`: @everyone, the assigned roles from lowest to highest, then the member row. */
function layerOpinions(
	scope: Scope,
	who: Who,
	bit: bigint,
	layer: Layer,
	roles: Role[],
	rows: Overwrites | null
): Decided[] {
	const original = (role: Role) => scope.roles.find((r) => r.id === role.id) ?? role;
	const out: Decided[] = [];
	for (const role of roles) {
		if (!role.is_default) continue;
		const setter = setterOf(role, roles, bit);
		if (setter) out.push({ value: setter.state, source: { kind: 'everyone', layer } });
	}
	const assigned = new Set(who.roleIds);
	const applied = roles
		.filter((r) => assigned.has(r.id) && !r.is_default)
		.sort((a, b) => a.position - b.position || a.id - b.id);
	for (const role of applied) {
		const setter = setterOf(role, roles, bit);
		if (!setter) continue;
		out.push({
			value: setter.state,
			source: {
				kind: 'role',
				layer,
				role: original(role),
				via: setter.role.id === role.id ? null : original(setter.role)
			}
		});
	}
	if (rows && layer !== 'server' && who.userId != null) {
		const { allow, deny } = rowBits(rows, { kind: 'members', id: who.userId });
		// The server applies a member row as (mask & ~deny) | allow, so allow wins over deny.
		if (allow & bit) out.push({ value: 'allow', source: { kind: 'member', layer } });
		else if (deny & bit) out.push({ value: 'deny', source: { kind: 'member', layer } });
	}
	return out;
}

/** Every step that has an opinion on `bit`, in the server's order; the last one decides. */
export function opinions(scope: Scope, who: Who, bit: bigint): Decided[] {
	const layers: [Layer, Overwrites | null][] = [
		['category', scope.category?.rows ?? null],
		['target', scope.target]
	];
	return [
		...layerOpinions(scope, who, bit, 'server', scope.roles, null),
		...layers.flatMap(([layer, rows]) =>
			rows ? layerOpinions(scope, who, bit, layer, overwritten(scope.roles, rows), rows) : []
		)
	];
}

/** What decides `bit` for someone, before the rule that no View clears every channel bit. */
export function decide(scope: Scope, who: Who, bit: bigint): Decided {
	if (who.userId != null && who.userId === scope.ownerId) {
		return { value: 'allow', source: { kind: 'owner' } };
	}
	return opinions(scope, who, bit).at(-1) ?? { value: 'deny', source: { kind: 'none' } };
}

function withoutBit(scope: Scope, subject: OverwriteSubject, bit: bigint): Scope {
	const row = withState(rowBits(scope.target, subject), bit, 'inherit');
	return { ...scope, target: withRow(scope.target, subject, row) };
}

/**
 * What a role row's bit falls back to: someone holding only this role (and @everyone), with
 * this row's bit cleared. `roleSilent` is set when nothing in the role's chain says anything.
 */
export function inheritedForRole(
	scope: Scope,
	role: Role,
	bit: bigint
): Decided & { roleSilent: boolean } {
	const without = withoutBit(scope, { kind: 'roles', id: role.id }, bit);
	const who: Who = { userId: null, roleIds: role.is_default ? [] : [role.id] };
	const steps = opinions(without, who, bit);
	const decided: Decided = steps.at(-1) ?? { value: 'deny', source: { kind: 'none' } };
	const roleSilent = role.is_default
		? steps.length === 0
		: !steps.some((step) => step.source.kind === 'role');
	return { ...decided, roleSilent };
}

/** What a member row's bit falls back to: the member with their real roles, with this row's bit cleared. */
export function inheritedForMember(scope: Scope, member: MemberInfo, bit: bigint): Decided {
	const without = withoutBit(scope, { kind: 'members', id: member.id }, bit);
	return decide(without, { userId: member.id, roleIds: member.roleIds }, bit);
}
