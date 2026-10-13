import { PERMISSION_GROUPS, Permission } from '$lib/permissions';

export type RolePresetId = 'empty' | 'admin' | 'moderator';

const listed = PERMISSION_GROUPS.flatMap((g) => g.permissions);
const ADMIN = listed.filter((p) => !p.danger).reduce((all, p) => all | p.bit, 0n);
const MODERATOR =
	Permission.MANAGE_MESSAGES |
	Permission.KICK_MEMBERS |
	Permission.MUTE_MEMBERS |
	Permission.MOVE_MEMBERS;

export const ROLE_PRESETS: { id: RolePresetId; label: string; allow: bigint }[] = [
	{ id: 'empty', label: 'Empty', allow: 0n },
	{ id: 'admin', label: 'Admin', allow: ADMIN },
	{ id: 'moderator', label: 'Moderator', allow: MODERATOR }
];

/** The toggles a preset ticks for someone holding `heldMask`; the server refuses bits you lack. */
export function presetAllow(id: RolePresetId, heldMask: bigint): bigint {
	const preset = ROLE_PRESETS.find((p) => p.id === id);
	return (preset?.allow ?? 0n) & heldMask;
}
