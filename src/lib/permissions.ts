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
	MANAGE_ROLES: 1n << 11n,
	MUTE_MEMBERS: 1n << 12n,
	MOVE_MEMBERS: 1n << 13n,
	DELETE_CHANNELS: 1n << 14n,
	MAP_IMPORTED_AUTHORS: 1n << 15n
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

export const ALL_PERMISSIONS = Object.values(Permission).reduce((all, bit) => all | bit, 0n);

/** The bits a channel or category overwrite can change. */
export const CHANNEL_BITS =
	Permission.VIEW_CHANNEL |
	Permission.SEND_MESSAGES |
	Permission.MANAGE_MESSAGES |
	Permission.CONNECT |
	Permission.SPEAK |
	Permission.STREAM;

/** `danger` permissions are shown apart in the role editor and never ticked by a preset. */
export type PermissionInfo = {
	bit: bigint;
	label: string;
	description: string;
	danger?: boolean;
};

export const PERMISSION_GROUPS: { label: string; permissions: PermissionInfo[] }[] = [
	{
		label: 'General',
		permissions: [
			{
				bit: Permission.VIEW_CHANNEL,
				label: 'View channels',
				description: 'See and read channels.'
			},
			{
				bit: Permission.CREATE_INVITE,
				label: 'Create invites',
				description: 'Invite people to the server.'
			}
		]
	},
	{
		label: 'Text',
		permissions: [
			{
				bit: Permission.SEND_MESSAGES,
				label: 'Send messages',
				description: 'Write in text channels and forums.'
			},
			{
				bit: Permission.MANAGE_MESSAGES,
				label: 'Manage messages',
				description: "Delete other people's messages."
			}
		]
	},
	{
		label: 'Voice',
		permissions: [
			{ bit: Permission.CONNECT, label: 'Connect', description: 'Join voice channels.' },
			{ bit: Permission.SPEAK, label: 'Speak', description: 'Talk in voice channels.' },
			{ bit: Permission.STREAM, label: 'Stream', description: 'Share video and screen.' },
			{
				bit: Permission.MUTE_MEMBERS,
				label: 'Mute members',
				description: 'Mute others in voice channels.'
			},
			{
				bit: Permission.MOVE_MEMBERS,
				label: 'Move members',
				description: 'Move others between voice channels.'
			}
		]
	},
	{
		label: 'Management',
		permissions: [
			{
				bit: Permission.MANAGE_CHANNELS,
				label: 'Manage channels',
				description: 'Create, edit and reorder channels and categories.'
			},
			{
				bit: Permission.DELETE_CHANNELS,
				label: 'Delete channels',
				description: 'Delete channels and categories. Deleting a channel removes its messages.',
				danger: true
			},
			{
				bit: Permission.MANAGE_INVITES,
				label: 'Manage invites',
				description: "See and revoke everyone's invites."
			},
			{
				bit: Permission.KICK_MEMBERS,
				label: 'Kick members',
				description: 'Remove members from the server.'
			},
			{
				bit: Permission.MANAGE_SERVER,
				label: 'Manage server',
				description: 'Change server settings.',
				danger: true
			},
			{
				bit: Permission.MANAGE_ROLES,
				label: 'Manage roles',
				description: 'Create and edit roles below their own, and assign them.'
			},
			{
				bit: Permission.MAP_IMPORTED_AUTHORS,
				label: 'Match imported authors',
				description:
					'Change which member imported messages belong to. The member can then edit and delete them.',
				danger: true
			}
		]
	}
];

export const DANGER_ZONE_LABEL = 'Danger zone';

/** The groups as the role editor shows them: flagged permissions leave their group for a last one. */
export function editorGroups(
	groups: typeof PERMISSION_GROUPS = PERMISSION_GROUPS
): typeof PERMISSION_GROUPS {
	const normal = groups
		.map((g) => ({ ...g, permissions: g.permissions.filter((p) => !p.danger) }))
		.filter((g) => g.permissions.length > 0);
	const danger = groups.flatMap((g) => g.permissions.filter((p) => p.danger));
	return danger.length > 0
		? [...normal, { label: DANGER_ZONE_LABEL, permissions: danger }]
		: normal;
}
