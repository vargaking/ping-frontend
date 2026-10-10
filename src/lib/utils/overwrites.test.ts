import { describe, expect, it } from 'vitest';
import { Permission } from '$lib/permissions';
import type { Role } from '$lib/types/server.types';
import type { Overwrites } from '$lib/types/overwrite.types';
import {
	NO_BITS,
	bitState,
	inheritedForRole,
	isPrivate,
	privateSteps,
	rowBits,
	rowOf,
	sameBits,
	withRow,
	withState
} from './overwrites';

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
const roles = [everyone, mod, junior];

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

describe('inheritedForRole', () => {
	it('names a parent row on the same target first', () => {
		const here = rows([{ role_id: 2, allow: String(VIEW), deny: '0' }]);
		expect(inheritedForRole(junior, VIEW, roles, here, null)).toBe('Allowed, from Mod here');
	});

	it('then the category', () => {
		const category = rows([{ role_id: 3, allow: '0', deny: String(SEND) }]);
		expect(inheritedForRole(junior, SEND, roles, rows([]), category)).toBe(
			'Denied by the category'
		);
	});

	it('then the role itself', () => {
		expect(inheritedForRole(everyone, VIEW, roles, null, null)).toBe('Allowed by the role');
		expect(inheritedForRole(mod, VIEW, roles, null, null)).toBe('Not set by the role');
	});
});

describe('private switch', () => {
	it('is on when @everyone is denied View', () => {
		expect(isPrivate(rows([{ role_id: 1, allow: '0', deny: '1' }]), 1)).toBe(true);
		expect(isPrivate(rows([{ role_id: 1, allow: '0', deny: '2' }]), 1)).toBe(false);
	});

	it('allows the keeper before denying everyone, keeping their other bits', () => {
		const current = rows([
			{ role_id: 1, allow: '0', deny: String(SEND) },
			{ role_id: 2, allow: '0', deny: String(VIEW) }
		]);
		expect(privateSteps(current, 1, { kind: 'roles', id: 2 })).toEqual([
			{ subject: { kind: 'roles', id: 2 }, bits: { allow: VIEW, deny: 0n } },
			{ subject: { kind: 'roles', id: 1 }, bits: { allow: 0n, deny: SEND | VIEW } }
		]);
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
