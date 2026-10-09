import { parseMask, Permission, type PermissionInfo } from '$lib/permissions';
import type { Role } from '$lib/types/server.types';
import type { OverwriteSubject, Overwrites } from '$lib/types/overwrite.types';
import { resolveRole, type PermissionState } from './roles';

/** The bits an overwrite can change, in the order the editor shows them. */
export const CHANNEL_PERMISSIONS: PermissionInfo[] = [
	{ bit: Permission.VIEW_CHANNEL, label: 'View channel', description: 'See it and read it.' },
	{ bit: Permission.SEND_MESSAGES, label: 'Send messages', description: 'Write in it.' },
	{
		bit: Permission.MANAGE_MESSAGES,
		label: 'Manage messages',
		description: "Delete other people's messages and pin or lock posts."
	},
	{ bit: Permission.CONNECT, label: 'Connect', description: 'Join it when it is a voice channel.' },
	{ bit: Permission.SPEAK, label: 'Speak', description: 'Talk in it.' },
	{ bit: Permission.STREAM, label: 'Stream', description: 'Share video and screen in it.' }
];

export type Bits = { allow: bigint; deny: bigint };

const NONE: Bits = { allow: 0n, deny: 0n };

export function rowBits(rows: Overwrites | null, subject: OverwriteSubject): Bits {
	if (!rows) return NONE;
	const row =
		subject.kind === 'roles'
			? rows.roles.find((r) => r.role_id === subject.id)
			: rows.members.find((m) => m.user_id === subject.id);
	return row ? { allow: parseMask(row.allow), deny: parseMask(row.deny) } : NONE;
}

export function bitState(bits: Bits, bit: bigint): PermissionState {
	if (bits.deny & bit) return 'deny';
	if (bits.allow & bit) return 'allow';
	return 'inherit';
}

export function withState(bits: Bits, bit: bigint, state: PermissionState): Bits {
	const allow = bits.allow & ~bit;
	const deny = bits.deny & ~bit;
	if (state === 'allow') return { allow: allow | bit, deny };
	if (state === 'deny') return { allow, deny: deny | bit };
	return { allow, deny };
}

const word = (state: 'allow' | 'deny') => (state === 'allow' ? 'Allowed' : 'Denied');

function chain(role: Role, roles: Role[]): Role[] {
	const byId = new Map(roles.map((r) => [r.id, r]));
	const out: Role[] = [];
	const seen = new Set<number>();
	let current: Role | undefined = role;
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		out.push(current);
		current = current.parent_id != null ? byId.get(current.parent_id) : undefined;
	}
	return out;
}

/**
 * What an "inherit" toggle on a role row resolves to: a parent role's row on
 * the same target, then the category's rows (for a channel in one), then
 * the role itself on the server.
 */
export function inheritedForRole(
	role: Role,
	bit: bigint,
	roles: Role[],
	here: Overwrites | null,
	category: Overwrites | null
): string {
	for (const ancestor of chain(role, roles).slice(1)) {
		const state = bitState(rowBits(here, { kind: 'roles', id: ancestor.id }), bit);
		if (state !== 'inherit') return `${word(state)}, from ${ancestor.name} here`;
	}
	if (category) {
		for (const ancestor of chain(role, roles)) {
			const state = bitState(rowBits(category, { kind: 'roles', id: ancestor.id }), bit);
			if (state !== 'inherit') return `${word(state)} by the category`;
		}
	}
	const resolved = resolveRole(role.id, roles);
	if (resolved.deny & bit) return 'Denied by the role';
	if (resolved.allow & bit) return 'Allowed by the role';
	return 'Not set by the role';
}

export function inheritedForMember(inCategory: boolean): string {
	return inCategory ? 'From their roles and the category' : 'From their roles';
}

/** Whether @everyone's row on the target denies View. */
export function isPrivate(rows: Overwrites | null, everyoneId: number | undefined): boolean {
	if (everyoneId == null) return false;
	return (
		bitState(rowBits(rows, { kind: 'roles', id: everyoneId }), Permission.VIEW_CHANNEL) === 'deny'
	);
}

/**
 * The writes that make a target private: the picked role or member is
 * allowed View first, so nobody is locked out between the two requests.
 */
export function privateSteps(
	rows: Overwrites | null,
	everyoneId: number,
	keeper: OverwriteSubject
): { subject: OverwriteSubject; bits: Bits }[] {
	const everyone: OverwriteSubject = { kind: 'roles', id: everyoneId };
	return [
		{ subject: keeper, bits: withState(rowBits(rows, keeper), Permission.VIEW_CHANNEL, 'allow') },
		{ subject: everyone, bits: withState(rowBits(rows, everyone), Permission.VIEW_CHANNEL, 'deny') }
	];
}
