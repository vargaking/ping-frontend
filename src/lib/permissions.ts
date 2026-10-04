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
	MOVE_MEMBERS: 1n << 13n
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

export type PermissionInfo = { bit: bigint; label: string; description: string };

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
				description: 'Create, edit and delete channels.'
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
				description: 'Change server settings.'
			},
			{
				bit: Permission.MANAGE_ROLES,
				label: 'Manage roles',
				description: 'Create and edit roles below their own, and assign them.'
			}
		]
	}
];
