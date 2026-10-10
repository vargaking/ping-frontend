import { parseMask, Permission, type PermissionInfo } from '$lib/permissions';
import type { Role } from '$lib/types/server.types';
import type {
	MemberOverwrite,
	OverwriteSubject,
	Overwrites,
	RoleOverwrite
} from '$lib/types/overwrite.types';
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

export const NO_BITS: Bits = { allow: 0n, deny: 0n };

export function rowBits(rows: Overwrites | null, subject: OverwriteSubject): Bits {
	if (!rows) return NO_BITS;
	const row =
		subject.kind === 'roles'
			? rows.roles.find((r) => r.role_id === subject.id)
			: rows.members.find((m) => m.user_id === subject.id);
	return rowOf(row ?? null);
}

export function sameBits(a: Bits, b: Bits): boolean {
	return a.allow === b.allow && a.deny === b.deny;
}

export function rowOf(row: RoleOverwrite | MemberOverwrite | null): Bits {
	return row ? { allow: parseMask(row.allow), deny: parseMask(row.deny) } : NO_BITS;
}

/** The rows with one subject's row replaced, added at the end, or removed when `bits` is empty. */
export function withRow(rows: Overwrites, subject: OverwriteSubject, bits: Bits): Overwrites {
	const empty = sameBits(bits, NO_BITS);
	const masks = { allow: String(bits.allow), deny: String(bits.deny) };
	if (subject.kind === 'roles') {
		const row: RoleOverwrite = { role_id: subject.id, ...masks };
		return { ...rows, roles: replaceRow(rows.roles, (r) => r.role_id === subject.id, row, empty) };
	}
	const row: MemberOverwrite = { user_id: subject.id, ...masks };
	return {
		...rows,
		members: replaceRow(rows.members, (m) => m.user_id === subject.id, row, empty)
	};
}

function replaceRow<T>(list: T[], matches: (item: T) => boolean, row: T, remove: boolean): T[] {
	if (!list.some(matches)) return remove ? [...list] : [...list, row];
	return remove
		? list.filter((item) => !matches(item))
		: list.map((item) => (matches(item) ? row : item));
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

const SHOWN_NAMES = 6;

function joinNames(names: string[]): string {
	if (names.length < 2) return names.join('');
	return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The line under the Private switch: who can see the channel or category. */
export function visibilityLine(
	noun: 'channel' | 'category',
	isPrivate: boolean,
	names: string[]
): string {
	if (!isPrivate) return `Everyone in the server can see this ${noun}.`;
	if (names.length === 0) {
		return 'Only the owner can see this. Allow View for a role or member below to let others in.';
	}
	const listed =
		names.length > SHOWN_NAMES
			? [...names.slice(0, SHOWN_NAMES), `${names.length - SHOWN_NAMES} more`]
			: names;
	return `Visible to ${joinNames([...listed, 'the owner'])}.`;
}
