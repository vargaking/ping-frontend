import { describe, expect, it } from 'vitest';
import { Permission } from '$lib/permissions';
import type { Role } from '$lib/types/server.types';
import type { Overwrites } from '$lib/types/overwrite.types';
import {
	NO_BITS,
	bitState,
	memberInheritedText,
	roleInheritedText,
	rowBits,
	rowSummary,
	visibilityLine,
	withRow,
	withState
} from './overwrites';
import type { Decided } from './channelResolution';

const VIEW = Permission.VIEW_CHANNEL;
const SEND = Permission.SEND_MESSAGES;

const role = (id: number, extra: Partial<Role> = {}): Role => ({
	id,
	name: `R${id}`,
	allow: '0',
	deny: '0',
	parent_id: null,
	is_default: false,
	position: id,
	color: null,
	...extra
});

const everyone = role(1, { name: '@everyone', is_default: true, position: 0, allow: '3' });
const mod = role(2, { name: 'Mod' });
const junior = role(3, { name: 'Junior', parent_id: 2 });

const rows = (r: Overwrites['roles'], m: Overwrites['members'] = []): Overwrites => ({
	roles: r,
	members: m
});

describe('bits', () => {
	it('reads and sets the three states', () => {
		const bits = withState({ allow: 0n, deny: 0n }, VIEW, 'allow');
		expect(bitState(bits, VIEW)).toBe('allow');
		const denied = withState(bits, VIEW, 'deny');
		expect(denied).toEqual({ allow: 0n, deny: VIEW });
		expect(withState(denied, VIEW, 'inherit')).toEqual({ allow: 0n, deny: 0n });
	});

	it('finds role and member rows', () => {
		const here = rows(
			[{ role_id: 2, allow: '1', deny: '0' }],
			[{ user_id: 9, allow: '0', deny: '2' }]
		);
		expect(rowBits(here, { kind: 'roles', id: 2 })).toEqual({ allow: 1n, deny: 0n });
		expect(rowBits(here, { kind: 'members', id: 9 })).toEqual({ allow: 0n, deny: 2n });
		expect(rowBits(here, { kind: 'roles', id: 5 })).toEqual({ allow: 0n, deny: 0n });
	});
});

const place = { noun: 'channel' as const, categoryName: 'Staff' };
const inCategory = { ...place, noun: 'category' as const };

describe('roleInheritedText', () => {
	it.each([
		{
			name: "the parent's setting on this channel",
			role: junior,
			value: 'deny',
			source: { kind: 'role', layer: 'target', role: junior, via: mod },
			expected: 'Denied, from Mod on this channel'
		},
		{
			name: "the parent's setting on this category",
			role: junior,
			value: 'deny',
			source: { kind: 'role', layer: 'target', role: junior, via: mod },
			where: inCategory,
			expected: 'Denied, from Mod on this category'
		},
		{
			name: 'the category when it set the role itself',
			role: junior,
			value: 'allow',
			source: { kind: 'role', layer: 'category', role: junior, via: null },
			expected: 'Allowed, from the category Staff'
		},
		{
			name: 'the parent and the category',
			role: junior,
			value: 'allow',
			source: { kind: 'role', layer: 'category', role: junior, via: mod },
			expected: 'Allowed, from Mod in the category Staff'
		},
		{
			name: 'the server permissions of the role',
			role: mod,
			value: 'allow',
			source: { kind: 'role', layer: 'server', role: mod, via: null },
			expected: "Allowed, from Mod's server permissions"
		},
		{
			name: 'the server permissions of the parent',
			role: junior,
			value: 'allow',
			source: { kind: 'role', layer: 'server', role: junior, via: mod },
			expected: "Allowed, from Mod's server permissions"
		},
		{
			name: 'that only @everyone speaks, currently allowed',
			role: mod,
			value: 'allow',
			source: { kind: 'everyone', layer: 'server' },
			roleSilent: true,
			expected: 'Not set for this role. Lower roles and @everyone decide: currently Allowed.'
		},
		{
			name: 'that only @everyone speaks, currently denied',
			role: mod,
			value: 'deny',
			source: { kind: 'none' },
			roleSilent: true,
			expected: 'Not set for this role. Lower roles and @everyone decide: currently Denied.'
		},
		{
			name: '@everyone on this channel when it overrides the role',
			role: mod,
			value: 'deny',
			source: { kind: 'everyone', layer: 'target' },
			expected: 'Denied, from @everyone on this channel'
		},
		{
			name: '@everyone in the category when it overrides the role',
			role: mod,
			value: 'deny',
			source: { kind: 'everyone', layer: 'category' },
			expected: 'Denied, from @everyone in the category Staff'
		},
		{
			name: 'the category for the @everyone row',
			role: everyone,
			value: 'deny',
			source: { kind: 'everyone', layer: 'category' },
			expected: 'Denied, from the category Staff'
		},
		{
			name: 'the server permissions for the @everyone row',
			role: everyone,
			value: 'allow',
			source: { kind: 'everyone', layer: 'server' },
			expected: "Allowed, from @everyone's server permissions"
		},
		{
			name: 'that the @everyone row is set nowhere',
			role: everyone,
			value: 'deny',
			source: { kind: 'none' },
			roleSilent: true,
			expected: 'Not set anywhere: Denied.'
		}
	] satisfies {
		name: string;
		role: Role;
		value: 'allow' | 'deny';
		source: Decided['source'];
		roleSilent?: boolean;
		where?: typeof place | typeof inCategory;
		expected: string;
	}[])('names $name', ({ role, value, source, roleSilent = false, where = place, expected }) => {
		expect(roleInheritedText(role, { value, source, roleSilent }, where)).toBe(expected);
	});
});

describe('memberInheritedText', () => {
	it.each([
		{
			name: 'that the owner owns the server',
			value: 'allow',
			source: { kind: 'owner' },
			expected: 'Allowed: they own the server'
		},
		{
			name: 'the deciding role',
			value: 'allow',
			source: { kind: 'role', layer: 'server', role: mod, via: null },
			expected: 'Allowed, from Mod'
		},
		{
			name: 'the deciding role in the category',
			value: 'allow',
			source: { kind: 'role', layer: 'category', role: mod, via: null },
			expected: 'Allowed, from Mod in the category Staff'
		},
		{
			name: 'the deciding role on the channel',
			value: 'allow',
			source: { kind: 'role', layer: 'target', role: mod, via: null },
			expected: 'Allowed, from Mod on this channel'
		},
		{
			name: 'the child the deciding role was inherited from',
			value: 'allow',
			source: { kind: 'role', layer: 'server', role: mod, via: junior },
			expected: 'Allowed, from Mod (inherited from Junior)'
		},
		{
			name: '@everyone on the server',
			value: 'deny',
			source: { kind: 'everyone', layer: 'server' },
			expected: 'Denied, from @everyone'
		},
		{
			name: '@everyone in the category',
			value: 'deny',
			source: { kind: 'everyone', layer: 'category' },
			expected: 'Denied, from @everyone in the category Staff'
		},
		{
			name: '@everyone on the channel',
			value: 'deny',
			source: { kind: 'everyone', layer: 'target' },
			expected: 'Denied, from @everyone on this channel'
		},
		{
			name: 'their own setting in the category',
			value: 'deny',
			source: { kind: 'member', layer: 'category' },
			expected: 'Denied, from their own setting in the category Staff'
		},
		{
			name: 'that no role allows it',
			value: 'deny',
			source: { kind: 'none' },
			expected: 'Denied: none of their roles allow it'
		}
	] satisfies {
		name: string;
		value: 'allow' | 'deny';
		source: Decided['source'];
		expected: string;
	}[])('says $name', ({ value, source, expected }) => {
		expect(memberInheritedText({ value, source }, place)).toBe(expected);
	});
});

describe('rowSummary', () => {
	it.each([
		{
			name: 'what is set',
			bits: { allow: VIEW, deny: SEND },
			expected: 'View: Allow · Send: Deny'
		},
		{
			name: 'what is set, in the order of the toggles',
			bits: { allow: Permission.STREAM, deny: Permission.MANAGE_MESSAGES },
			expected: 'Manage messages: Deny · Stream: Allow'
		},
		{ name: 'when nothing is set', bits: NO_BITS, expected: 'Nothing set' },
		{
			name: 'when only bits that are not channel bits are set',
			bits: { allow: Permission.MANAGE_ROLES, deny: 0n },
			expected: 'Nothing set'
		}
	])('lists $name', ({ bits, expected }) => {
		expect(rowSummary(bits)).toBe(expected);
	});
});

describe('visibilityLine', () => {
	const ownerOnly =
		'Only the owner can see this. Allow View for a role or member below to let others in.';

	it.each([
		{ noun: 'channel', names: [] },
		{ noun: 'category', names: ['Admin'] }
	] as const)('says everyone can see this $noun when it is not private', ({ noun, names }) => {
		expect(visibilityLine(noun, false, [...names])).toBe(
			`Everyone in the server can see this ${noun}.`
		);
	});

	it.each(['channel', 'category'] as const)(
		'says only the owner can see a private %s when nobody is allowed',
		(noun) => {
			expect(visibilityLine(noun, true, [])).toBe(ownerOnly);
		}
	);

	it.each([
		{ noun: 'channel', names: ['Admin'], expected: 'Visible to Admin and the owner.' },
		{
			noun: 'channel',
			names: ['Admin', 'Core member'],
			expected: 'Visible to Admin, Core member and the owner.'
		},
		{ noun: 'category', names: ['A', 'B', 'C'], expected: 'Visible to A, B, C and the owner.' }
	] as const)('lists who can see it, then the owner: $names', ({ noun, names, expected }) => {
		expect(visibilityLine(noun, true, [...names])).toBe(expected);
	});

	const six = ['A', 'B', 'C', 'D', 'E', 'F'];
	it.each([
		{ extra: [], expected: 'Visible to A, B, C, D, E, F and the owner.' },
		{ extra: ['G'], expected: 'Visible to A, B, C, D, E, F, 1 more and the owner.' },
		{ extra: ['G', 'H', 'I'], expected: 'Visible to A, B, C, D, E, F, 3 more and the owner.' }
	])('shortens a list of $extra.length names past six', ({ extra, expected }) => {
		expect(visibilityLine('channel', true, [...six, ...extra])).toBe(expected);
	});
});

describe('row helpers', () => {
	const subject = { kind: 'roles' as const, id: 2 };
	const current = rows(
		[
			{ role_id: 1, allow: '0', deny: '2' },
			{ role_id: 2, allow: '1', deny: '0' }
		],
		[{ user_id: 9, allow: '0', deny: '2' }]
	);

	it('adds a row at the end', () => {
		const next = withRow(current, { kind: 'roles', id: 7 }, { allow: 1n, deny: 0n });
		expect(next.roles.map((r) => r.role_id)).toEqual([1, 2, 7]);
		const member = withRow(current, { kind: 'members', id: 4 }, { allow: 0n, deny: 1n });
		expect(member.members).toEqual([
			{ user_id: 9, allow: '0', deny: '2' },
			{ user_id: 4, allow: '0', deny: '1' }
		]);
	});

	it('does not change the rows it was given', () => {
		const snapshot = JSON.stringify(current);
		withRow(current, subject, { allow: 3n, deny: 4n });
		withRow(current, subject, NO_BITS);
		withRow(current, { kind: 'roles', id: 7 }, { allow: 1n, deny: 0n });
		expect(JSON.stringify(current)).toBe(snapshot);
	});
});
