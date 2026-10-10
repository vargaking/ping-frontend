import { describe, expect, it } from 'vitest';
import { Permission } from '$lib/permissions';
import type { Role } from '$lib/types/server.types';
import type { Overwrites } from '$lib/types/overwrite.types';
import {
	CHANNEL_PERMISSIONS,
	NO_BITS,
	bitState,
	memberInheritedText,
	roleInheritedText,
	rowBits,
	rowOf,
	rowSummary,
	sameBits,
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

function roleText(
	target: Role,
	value: 'allow' | 'deny',
	source: Decided['source'],
	roleSilent = false
) {
	return roleInheritedText(target, { value, source, roleSilent }, place);
}

describe('roleInheritedText', () => {
	it("names the parent's setting on this channel", () => {
		const source = { kind: 'role', layer: 'target', role: junior, via: mod } as const;
		expect(roleText(junior, 'deny', source)).toBe('Denied, from Mod on this channel');
		expect(
			roleInheritedText(
				junior,
				{ value: 'deny', source, roleSilent: false },
				{ ...place, noun: 'category' }
			)
		).toBe('Denied, from Mod on this category');
	});

	it('names the category when it set the role itself', () => {
		const source = { kind: 'role', layer: 'category', role: junior, via: null } as const;
		expect(roleText(junior, 'allow', source)).toBe('Allowed, from the category Staff');
	});

	it('names the parent and the category', () => {
		const source = { kind: 'role', layer: 'category', role: junior, via: mod } as const;
		expect(roleText(junior, 'allow', source)).toBe('Allowed, from Mod in the category Staff');
	});

	it('names the server permissions of the role or its parent', () => {
		expect(roleText(mod, 'allow', { kind: 'role', layer: 'server', role: mod, via: null })).toBe(
			"Allowed, from Mod's server permissions"
		);
		expect(
			roleText(junior, 'allow', { kind: 'role', layer: 'server', role: junior, via: mod })
		).toBe("Allowed, from Mod's server permissions");
	});

	it('says nothing is set for the role when only @everyone speaks', () => {
		const text = 'Not set for this role. Lower roles and @everyone decide: currently Allowed.';
		expect(roleText(mod, 'allow', { kind: 'everyone', layer: 'server' }, true)).toBe(text);
		expect(roleText(mod, 'deny', { kind: 'none' }, true)).toBe(
			'Not set for this role. Lower roles and @everyone decide: currently Denied.'
		);
	});

	it('names @everyone when it overrides the role', () => {
		expect(roleText(mod, 'deny', { kind: 'everyone', layer: 'target' })).toBe(
			'Denied, from @everyone on this channel'
		);
		expect(roleText(mod, 'deny', { kind: 'everyone', layer: 'category' })).toBe(
			'Denied, from @everyone in the category Staff'
		);
	});

	it('names where the @everyone row falls back to', () => {
		expect(roleText(everyone, 'deny', { kind: 'everyone', layer: 'category' }, false)).toBe(
			'Denied, from the category Staff'
		);
		expect(roleText(everyone, 'allow', { kind: 'everyone', layer: 'server' })).toBe(
			"Allowed, from @everyone's server permissions"
		);
		expect(roleText(everyone, 'deny', { kind: 'none' }, true)).toBe('Not set anywhere: Denied.');
	});
});

describe('memberInheritedText', () => {
	const text = (value: 'allow' | 'deny', source: Decided['source']) =>
		memberInheritedText({ value, source }, place);

	it('says the owner owns the server', () => {
		expect(text('allow', { kind: 'owner' })).toBe('Allowed: they own the server');
	});

	it('names the deciding role', () => {
		const at = (layer: 'server' | 'category' | 'target', via: Role | null = null) =>
			text('allow', { kind: 'role', layer, role: mod, via });
		expect(at('server')).toBe('Allowed, from Mod');
		expect(at('category')).toBe('Allowed, from Mod in the category Staff');
		expect(at('target')).toBe('Allowed, from Mod on this channel');
		expect(at('server', junior)).toBe('Allowed, from Mod (inherited from Junior)');
	});

	it('names @everyone', () => {
		expect(text('deny', { kind: 'everyone', layer: 'server' })).toBe('Denied, from @everyone');
		expect(text('deny', { kind: 'everyone', layer: 'category' })).toBe(
			'Denied, from @everyone in the category Staff'
		);
		expect(text('deny', { kind: 'everyone', layer: 'target' })).toBe(
			'Denied, from @everyone on this channel'
		);
	});

	it('names their own setting in the category', () => {
		expect(text('deny', { kind: 'member', layer: 'category' })).toBe(
			'Denied, from their own setting in the category Staff'
		);
	});

	it('says no role allows it', () => {
		expect(text('deny', { kind: 'none' })).toBe('Denied: none of their roles allow it');
	});
});

describe('rowSummary', () => {
	it('has a short label for every toggle', () => {
		expect(CHANNEL_PERMISSIONS.map((p) => p.short)).toEqual([
			'View',
			'Send',
			'Manage messages',
			'Connect',
			'Speak',
			'Stream'
		]);
	});

	it('lists what is set, in the order of the toggles', () => {
		expect(rowSummary({ allow: VIEW, deny: SEND })).toBe('View: Allow · Send: Deny');
		expect(rowSummary({ allow: Permission.STREAM, deny: Permission.MANAGE_MESSAGES })).toBe(
			'Manage messages: Deny · Stream: Allow'
		);
	});

	it('says when nothing is set', () => {
		expect(rowSummary(NO_BITS)).toBe('Nothing set');
	});

	it('ignores bits that are not channel bits', () => {
		expect(rowSummary({ allow: Permission.MANAGE_ROLES, deny: 0n })).toBe('Nothing set');
	});
});

describe('visibilityLine', () => {
	it('says everyone can see it when it is not private', () => {
		expect(visibilityLine('channel', false, [])).toBe(
			'Everyone in the server can see this channel.'
		);
		expect(visibilityLine('category', false, ['Admin'])).toBe(
			'Everyone in the server can see this category.'
		);
	});

	it('says only the owner can see it when nobody is allowed', () => {
		expect(visibilityLine('channel', true, [])).toBe(
			'Only the owner can see this. Allow View for a role or member below to let others in.'
		);
		expect(visibilityLine('category', true, [])).toBe(
			'Only the owner can see this. Allow View for a role or member below to let others in.'
		);
	});

	it('lists who can see it, then the owner', () => {
		expect(visibilityLine('channel', true, ['Admin'])).toBe('Visible to Admin and the owner.');
		expect(visibilityLine('channel', true, ['Admin', 'Core member'])).toBe(
			'Visible to Admin, Core member and the owner.'
		);
		expect(visibilityLine('category', true, ['A', 'B', 'C'])).toBe(
			'Visible to A, B, C and the owner.'
		);
	});

	it('shortens a long list', () => {
		const names = ['A', 'B', 'C', 'D', 'E', 'F'];
		expect(visibilityLine('channel', true, names)).toBe(
			'Visible to A, B, C, D, E, F and the owner.'
		);
		expect(visibilityLine('channel', true, [...names, 'G'])).toBe(
			'Visible to A, B, C, D, E, F, 1 more and the owner.'
		);
		expect(visibilityLine('channel', true, [...names, 'G', 'H', 'I'])).toBe(
			'Visible to A, B, C, D, E, F, 3 more and the owner.'
		);
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

	it('compares bits by value', () => {
		expect(sameBits({ allow: 1n, deny: 2n }, { allow: 1n, deny: 2n })).toBe(true);
		expect(sameBits({ allow: 1n, deny: 2n }, { allow: 2n, deny: 1n })).toBe(false);
		expect(sameBits(NO_BITS, { allow: 0n, deny: 0n })).toBe(true);
	});

	it('reads the bits of a saved row, none for null', () => {
		expect(rowOf(null)).toEqual({ allow: 0n, deny: 0n });
		expect(rowOf({ role_id: 2, allow: '5', deny: '2' })).toEqual({ allow: 5n, deny: 2n });
		expect(rowOf({ user_id: 9, allow: '0', deny: '8' })).toEqual({ allow: 0n, deny: 8n });
	});

	it('replaces a row in place', () => {
		const next = withRow(current, subject, { allow: 3n, deny: 4n });
		expect(next.roles).toEqual([
			{ role_id: 1, allow: '0', deny: '2' },
			{ role_id: 2, allow: '3', deny: '4' }
		]);
		expect(next.roles[0]).toBe(current.roles[0]);
		expect(next.members).toBe(current.members);
	});

	it('adds a row at the end', () => {
		const next = withRow(current, { kind: 'roles', id: 7 }, { allow: 1n, deny: 0n });
		expect(next.roles.map((r) => r.role_id)).toEqual([1, 2, 7]);
		const member = withRow(current, { kind: 'members', id: 4 }, { allow: 0n, deny: 1n });
		expect(member.members).toEqual([
			{ user_id: 9, allow: '0', deny: '2' },
			{ user_id: 4, allow: '0', deny: '1' }
		]);
	});

	it('removes a row when the bits are empty', () => {
		expect(withRow(current, subject, NO_BITS).roles.map((r) => r.role_id)).toEqual([1]);
		expect(withRow(current, { kind: 'members', id: 9 }, NO_BITS).members).toEqual([]);
	});

	it('does not change the rows it was given', () => {
		const snapshot = JSON.stringify(current);
		withRow(current, subject, { allow: 3n, deny: 4n });
		withRow(current, subject, NO_BITS);
		withRow(current, { kind: 'roles', id: 7 }, { allow: 1n, deny: 0n });
		expect(JSON.stringify(current)).toBe(snapshot);
	});
});
