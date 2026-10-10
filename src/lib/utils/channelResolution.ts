import { ALL_PERMISSIONS, CHANNEL_BITS, Permission } from '$lib/permissions';
import type { OverwriteSubject, Overwrites } from '$lib/types/overwrite.types';
import type { Role } from '$lib/types/server.types';
import { rowBits, withRow, withState, type Bits } from './overwrites';
import { applyLayer, memberMask, sortRoles } from './roles';

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
