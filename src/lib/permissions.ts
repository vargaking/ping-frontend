import type { Role } from '$lib/types/server.types';

/** Bit positions match the server; masks arrive as decimal strings. */
export const Permission = {
	VIEW_CHANNEL: 1n << 0n,
	SEND_MESSAGES: 1n << 1n,
	MANAGE_MESSAGES: 1n << 2n,
	CONNECT: 1n << 3n,
	SPEAK: 1n << 4n,
	STREAM: 1n << 5n,
	CREATE_INVITE: 1n << 6n,
	MANAGE_INVITES: 1n << 7n,
	MANAGE_CHANNELS: 1n << 8n,
	KICK_MEMBERS: 1n << 9n,
	MANAGE_SERVER: 1n << 10n,
	MANAGE_ROLES: 1n << 11n
} as const;

export function parseMask(mask: string): bigint {
	try {
		return BigInt(mask);
	} catch {
		return 0n;
	}
}

export function has(mask: bigint | undefined, perm: bigint): boolean {
	return mask != null && (mask & perm) === perm;
}

/** Mirrors the server's resolver: the default role plus assigned roles, each with its parents. */
export function rolesMask(roles: Role[], assignedIds: number[]): bigint {
	const byId = new Map(roles.map((r) => [r.id, r]));
	const applied = roles.filter((r) => r.is_default).map((r) => r.id);
	let allow = 0n;
	let deny = 0n;
	for (const start of [...applied, ...assignedIds]) {
		const seen = new Set<number>();
		let role = byId.get(start);
		while (role && !seen.has(role.id)) {
			seen.add(role.id);
			allow |= parseMask(role.allow);
			deny |= parseMask(role.deny);
			role = role.parent_id != null ? byId.get(role.parent_id) : undefined;
		}
	}
	return allow & ~deny;
}
