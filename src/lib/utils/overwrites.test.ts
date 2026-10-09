import { describe, expect, it } from 'vitest';
import { Permission } from '$lib/permissions';
import type { Role } from '$lib/types/server.types';
import type { Overwrites } from '$lib/types/overwrite.types';
import {
	bitState,
	inheritedForRole,
	isPrivate,
	privateSteps,
	rowBits,
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
