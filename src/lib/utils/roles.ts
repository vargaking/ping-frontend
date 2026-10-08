import { ALL_PERMISSIONS, parseMask } from '$lib/permissions';
import type { Role } from '$lib/types/server.types';

export type PermissionState = 'inherit' | 'allow' | 'deny';

/** A role's own setting for a bit; a bit in both masks counts as denied, like on the server. */
export function ownState(role: Pick<Role, 'allow' | 'deny'>, bit: bigint): PermissionState {
	if (parseMask(role.deny) & bit) return 'deny';
	if (parseMask(role.allow) & bit) return 'allow';
	return 'inherit';
}

function chainFromRoot(roleId: number | null, byId: Map<number, Role>): Role[] {
	const chain: Role[] = [];
	const seen = new Set<number>();
	while (roleId != null && !seen.has(roleId)) {
		const role = byId.get(roleId);
		if (!role) break;
		seen.add(roleId);
		chain.push(role);
		roleId = role.parent_id;
	}
	return chain.reverse();
}

const indexById = (roles: Role[]) => new Map(roles.map((r) => [r.id, r]));

/** What a role says after inheritance: the nearest role that sets a bit decides it. */
export function resolveRole(roleId: number, roles: Role[]): { allow: bigint; deny: bigint } {
	let allow = 0n;
	let deny = 0n;
	for (const role of chainFromRoot(roleId, indexById(roles))) {
		const roleDeny = parseMask(role.deny);
		const ownAllow = parseMask(role.allow) & ~roleDeny;
		allow = (allow & ~roleDeny) | ownAllow;
		deny = (deny & ~ownAllow) | roleDeny;
	}
	return { allow, deny };
}

/** The default role's allow, then the assigned roles from lowest to highest position. */
export function memberMask(roles: Role[], assignedIds: number[]): bigint {
	let mask = 0n;
	for (const role of roles) {
		if (role.is_default) mask |= resolveRole(role.id, roles).allow;
	}
	const assigned = new Set(assignedIds);
	const applied = roles
		.filter((r) => assigned.has(r.id) && !r.is_default)
		.sort((a, b) => a.position - b.position || a.id - b.id);
	for (const role of applied) {
		const { allow, deny } = resolveRole(role.id, roles);
		mask = (mask | allow) & ~deny;
	}
	return mask & ALL_PERMISSIONS;
}

/** Position of the member's highest role; 0 without one. */
export function rankOf(roles: Role[], assignedIds: number[]): number {
	const assigned = new Set(assignedIds);
	return roles.reduce((rank, r) => (assigned.has(r.id) ? Math.max(rank, r.position) : rank), 0);
}

/** Whether making `parentId` the parent of `roleId` would close a loop. */
export function wouldCycle(roleId: number, parentId: number | null, roles: Role[]): boolean {
	const byId = indexById(roles);
	const seen = new Set<number>();
	while (parentId != null && !seen.has(parentId)) {
		if (parentId === roleId) return true;
		seen.add(parentId);
		parentId = byId.get(parentId)?.parent_id ?? null;
	}
	return false;
}

/** The nearest role above `role` that sets `bit`, and what it sets it to. */
export function inheritedSource(
	role: Pick<Role, 'parent_id'>,
	bit: bigint,
	roles: Role[]
): { role: Role; state: 'allow' | 'deny' } | null {
	const chain = chainFromRoot(role.parent_id, indexById(roles)).reverse();
	for (const ancestor of chain) {
		const state = ownState(ancestor, bit);
		if (state !== 'inherit') return { role: ancestor, state };
	}
	return null;
}

const byRankDesc = (a: Role, b: Role) => b.position - a.position || b.id - a.id;

/** The member's assigned roles, highest first; the default role is never included. */
export function assignedRoles(roles: Role[], assignedIds: number[]): Role[] {
	const assigned = new Set(assignedIds);
	return roles.filter((r) => assigned.has(r.id) && !r.is_default).sort(byRankDesc);
}

/** Colour of the highest assigned role that has one. */
export function nameColor(roles: Role[], assignedIds: number[]): string | null {
	return assignedRoles(roles, assignedIds).find((r) => r.color)?.color ?? null;
}

export function sortRoles(roles: Role[]): Role[] {
	return [...roles].sort(byRankDesc);
}

export function applyPositions(roles: Role[], positions: { id: number; position: number }[]) {
	const next = new Map(positions.map((p) => [p.id, p.position]));
	return sortRoles(roles.map((r) => (next.has(r.id) ? { ...r, position: next.get(r.id)! } : r)));
}

/** Positions for role ids listed highest first, as the server numbers them. */
export function positionsForOrder(ids: number[]): { id: number; position: number }[] {
	return ids.map((id, i) => ({ id, position: ids.length - i }));
}

/** Move `id` next to `targetId` in a highest-first id list. */
export function moveRole(
	ids: number[],
	id: number,
	targetId: number,
	edge: 'before' | 'after'
): number[] {
	if (id === targetId) return ids;
	const rest = ids.filter((x) => x !== id);
	const at = rest.indexOf(targetId);
	if (at < 0 || !ids.includes(id)) return ids;
	rest.splice(edge === 'before' ? at : at + 1, 0, id);
	return rest;
}

/** Whether `rank` may change the role: the owner always can, others only below their rank. */
export function canTouchRole(role: Role, rank: number, isOwner: boolean): boolean {
	return isOwner || role.position < rank;
}

/** Whether someone with this rank and mask may hand out or take away `role`. */
export function canAssignRole(
	role: Role,
	roles: Role[],
	actor: { rank: number; isOwner: boolean; mask: bigint }
): boolean {
	return (
		canTouchRole(role, actor.rank, actor.isOwner) &&
		!(resolveRole(role.id, roles).allow & ~actor.mask)
	);
}

/** The roles after one is deleted: children of it lose their parent. */
export function withoutRole(roles: Role[], roleId: number): Role[] {
	return roles
		.filter((r) => r.id !== roleId)
		.map((r) => (r.parent_id === roleId ? { ...r, parent_id: null } : r));
}
