import { parseMask, Permission, type PermissionInfo } from '$lib/permissions';
import type { Role } from '$lib/types/server.types';
import type {
	MemberOverwrite,
	OverwriteSubject,
	Overwrites,
	RoleOverwrite
} from '$lib/types/overwrite.types';
import type { Decided } from './channelResolution';
import type { PermissionState } from './roles';

/** The bits an overwrite can change, in the order the editor shows them. */
export const CHANNEL_PERMISSIONS: (PermissionInfo & { short: string })[] = [
	{
		bit: Permission.VIEW_CHANNEL,
		label: 'View channel',
		short: 'View',
		description: 'See it and read it.'
	},
	{
		bit: Permission.SEND_MESSAGES,
		label: 'Send messages',
		short: 'Send',
		description: 'Write in it.'
	},
	{
		bit: Permission.MANAGE_MESSAGES,
		label: 'Manage messages',
		short: 'Manage messages',
		description: "Delete other people's messages and pin or lock posts."
	},
	{
		bit: Permission.CONNECT,
		label: 'Connect',
		short: 'Connect',
		description: 'Join it when it is a voice channel.'
	},
	{ bit: Permission.SPEAK, label: 'Speak', short: 'Speak', description: 'Talk in it.' },
	{
		bit: Permission.STREAM,
		label: 'Stream',
		short: 'Stream',
		description: 'Share video and screen in it.'
	}
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

const word = (value: 'allow' | 'deny') => (value === 'allow' ? 'Allowed' : 'Denied');

export type Place = { noun: 'channel' | 'category'; categoryName: string | null };

const theCategory = (place: Place) =>
	place.categoryName ? `the category ${place.categoryName}` : 'the category';

/** Where a role row's bit falls back to, in words. */
export function roleInheritedText(
	role: Role,
	inherited: Decided & { roleSilent: boolean },
	place: Place
): string {
	const { source } = inherited;
	const value = word(inherited.value);
	if (role.is_default) {
		if (source.kind === 'everyone' && source.layer === 'category') {
			return `${value}, from ${theCategory(place)}`;
		}
		if (source.kind === 'everyone' && source.layer === 'target') {
			return `${value}, from @everyone on this ${place.noun}`;
		}
		if (source.kind === 'everyone') return `${value}, from @everyone's server permissions`;
		return `Not set anywhere: ${value}.`;
	}
	if (source.kind === 'role') {
		const named = source.via ?? source.role;
		if (source.layer === 'server') return `${value}, from ${named.name}'s server permissions`;
		if (source.layer === 'category') {
			return source.via
				? `${value}, from ${source.via.name} in ${theCategory(place)}`
				: `${value}, from ${theCategory(place)}`;
		}
		return `${value}, from ${named.name} on this ${place.noun}`;
	}
	if (inherited.roleSilent) {
		return `Not set for this role. Lower roles and @everyone decide: currently ${value}.`;
	}
	if (source.kind === 'everyone' && source.layer === 'category') {
		return `${value}, from @everyone in ${theCategory(place)}`;
	}
	if (source.kind === 'everyone' && source.layer === 'target') {
		return `${value}, from @everyone on this ${place.noun}`;
	}
	return `${value}, from @everyone's server permissions`;
}

/** Where a member row's bit falls back to, in words. */
export function memberInheritedText(inherited: Decided, place: Place): string {
	const { source } = inherited;
	const value = word(inherited.value);
	switch (source.kind) {
		case 'owner':
			return `${value}: they own the server`;
		case 'none':
			return `${value}: none of their roles allow it`;
		case 'member':
			return `${value}, from their own setting in ${theCategory(place)}`;
		case 'everyone':
			if (source.layer === 'server') return `${value}, from @everyone`;
			if (source.layer === 'category') return `${value}, from @everyone in ${theCategory(place)}`;
			return `${value}, from @everyone on this ${place.noun}`;
		case 'role': {
			const where =
				source.layer === 'server'
					? ''
					: source.layer === 'category'
						? ` in ${theCategory(place)}`
						: ` on this ${place.noun}`;
			const via = source.via ? ` (inherited from ${source.via.name})` : '';
			return `${value}, from ${source.role.name}${where}${via}`;
		}
	}
}

/** What a closed row shows: "View: Allow · Send: Deny", or that nothing is set. */
export function rowSummary(bits: Bits): string {
	const set = CHANNEL_PERMISSIONS.flatMap(({ bit, short }) => {
		const state = bitState(bits, bit);
		return state === 'inherit' ? [] : [`${short}: ${state === 'allow' ? 'Allow' : 'Deny'}`];
	});
	return set.length > 0 ? set.join(' · ') : 'Nothing set';
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
