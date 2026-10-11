import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, Permission } from '$lib/permissions';
import type { Role } from '$lib/types/server.types';
import {
	applyLayer,
	applyPositions,
	assignedRoles,
	canAssignRole,
	canTouchRole,
	inheritedSource,
	memberMask,
	moveRole,
	nameColor,
	ownState,
	positionsForOrder,
	rankOf,
	resolveRole,
	withoutRole,
	wouldCycle
} from './roles';

const { SEND_MESSAGES: SEND, KICK_MEMBERS: KICK, MANAGE_MESSAGES: MANAGE } = Permission;
const MEMBER = Permission.VIEW_CHANNEL | SEND;

type Spec = Partial<Omit<Role, 'allow' | 'deny'>> & { id: number; allow?: bigint; deny?: bigint };

function role({ allow = 0n, deny = 0n, ...rest }: Spec): Role {
	return {
		name: `role ${rest.id}`,
		parent_id: null,
		is_default: false,
		position: 0,
		color: null,
		...rest,
		allow: String(allow),
		deny: String(deny)
	};
}

const everyone = (allow = MEMBER) => role({ id: 1, allow, is_default: true });

describe('resolveRole', () => {
	it.each([
		{
			name: 'a child allow beats a parent deny',
			roles: [role({ id: 2, deny: KICK }), role({ id: 3, allow: KICK, parent_id: 2 })],
			expected: { allow: KICK, deny: 0n }
		},
		{
			name: 'a child deny beats a parent allow',
			roles: [role({ id: 2, allow: KICK | MANAGE }), role({ id: 3, deny: KICK, parent_id: 2 })],
			expected: { allow: MANAGE, deny: KICK }
		}
	])('lets $name', ({ roles, expected }) => {
		expect(resolveRole(3, roles)).toEqual(expected);
	});

	it('keeps a grandparent value that nothing nearer overrides', () => {
		const roles = [
			role({ id: 2, allow: KICK }),
			role({ id: 3, parent_id: 2 }),
			role({ id: 4, parent_id: 3 })
		];
		expect(resolveRole(4, roles)).toEqual({ allow: KICK, deny: 0n });
	});

	it('counts a bit in both allow and deny of one role as denied', () => {
		const roles = [role({ id: 2, allow: KICK | SEND, deny: KICK })];
		expect(resolveRole(2, roles)).toEqual({ allow: SEND, deny: KICK });
	});

	it('stops at the first repeat of a parent cycle', () => {
		const roles = [
			role({ id: 2, allow: KICK, parent_id: 3 }),
			role({ id: 3, allow: MANAGE, parent_id: 2 })
		];
		expect(resolveRole(2, roles)).toEqual({ allow: KICK | MANAGE, deny: 0n });
	});
});

describe('memberMask', () => {
	it.each([
		{ name: 'a deny above an allow denies the bit', allowAt: 1, denyAt: 2, expected: 0n },
		{ name: 'an allow above a deny allows the bit', allowAt: 2, denyAt: 1, expected: SEND }
	])('$name', ({ allowAt, denyAt, expected }) => {
		const roles = [
			everyone(),
			role({ id: 2, position: allowAt, allow: SEND }),
			role({ id: 3, position: denyAt, deny: SEND })
		];
		expect(memberMask(roles, [2, 3]) & SEND).toBe(expected);
	});

	it('denies the bit when Muted sits below roles that say nothing about it', () => {
		const roles = [
			everyone(),
			role({ id: 2, position: 2, allow: KICK }),
			role({ id: 3, position: 1, deny: SEND })
		];
		const mask = memberMask(roles, [2, 3]);
		expect(mask & SEND).toBe(0n);
		expect(mask & KICK).toBe(KICK);
	});

	it('adds up unrelated roles', () => {
		const roles = [
			everyone(),
			role({ id: 2, position: 1, allow: KICK }),
			role({ id: 3, position: 2, allow: MANAGE })
		];
		expect(memberMask(roles, [2, 3])).toBe(MEMBER | KICK | MANAGE);
	});

	it('ignores default-role deny, unassigned roles and unknown ids', () => {
		const roles = [
			role({ id: 1, allow: MEMBER, deny: KICK, is_default: true }),
			role({ id: 2, position: 1, allow: KICK })
		];
		expect(memberMask(roles, [])).toBe(MEMBER);
		expect(memberMask(roles, [999])).toBe(MEMBER);
	});

	it('applies equal positions in id order', () => {
		const roles = [everyone(), role({ id: 2, allow: KICK }), role({ id: 3, deny: KICK })];
		expect(memberMask(roles, [3, 2]) & KICK).toBe(0n);
	});

	it('limits the mask to known bits', () => {
		expect(memberMask([everyone((1n << 40n) | SEND)], [])).toBe(SEND);
	});
});

describe('applyLayer', () => {
	it('lets the default role deny bits the mask already holds', () => {
		const roles = [role({ id: 1, allow: SEND, deny: KICK, is_default: true })];
		expect(applyLayer(KICK | MANAGE, roles, [])).toBe(MANAGE | SEND);
	});

	it('lets a higher role allow back what the default role denied', () => {
		const roles = [
			role({ id: 1, deny: SEND, is_default: true }),
			role({ id: 2, position: 1, allow: SEND })
		];
		expect(applyLayer(SEND, roles, [])).toBe(0n);
		expect(applyLayer(SEND, roles, [2])).toBe(SEND);
	});

	it('leaves the mask alone when no role says anything', () => {
		expect(applyLayer(KICK, [everyone(0n), role({ id: 2, position: 1 })], [2])).toBe(KICK);
	});
});

describe('rankOf', () => {
	const roles = [
		everyone(),
		role({ id: 2, position: 1 }),
		role({ id: 3, position: 3 }),
		role({ id: 4, position: 2 })
	];

	it.each([
		{ assigned: [2, 4], expected: 2 },
		{ assigned: [4, 3, 2], expected: 3 },
		{ assigned: [], expected: 0 },
		{ assigned: [999], expected: 0 }
	])('is $expected for the assigned roles $assigned', ({ assigned, expected }) => {
		expect(rankOf(roles, assigned)).toBe(expected);
	});
});

describe('canTouchRole', () => {
	const mod = role({ id: 2, position: 2 });

	it.each([
		{ rank: 3, expected: true },
		{ rank: 2, expected: false },
		{ rank: 1, expected: false }
	])('allows only roles strictly below the rank: rank $rank is $expected', ({ rank, expected }) => {
		expect(canTouchRole(mod, rank, false)).toBe(expected);
	});

	it('lets the owner touch anything', () => {
		expect(canTouchRole(mod, 0, true)).toBe(true);
	});
});

describe('canAssignRole', () => {
	const actor = { rank: 3, isOwner: false, mask: MEMBER | KICK };

	it('lets the owner assign anything', () => {
		const roles = [role({ id: 2, position: 9, allow: MANAGE })];
		expect(
			canAssignRole(roles[0], roles, { rank: Infinity, isOwner: true, mask: ALL_PERMISSIONS })
		).toBe(true);
	});

	it.each([3, 4])('refuses a role at position %i, at or above the actor rank', (position) => {
		const roles = [role({ id: 2, position })];
		expect(canAssignRole(roles[0], roles, actor)).toBe(false);
	});

	it('allows a role below the rank that stays inside the mask', () => {
		const roles = [role({ id: 2, position: 2, allow: KICK })];
		expect(canAssignRole(roles[0], roles, actor)).toBe(true);
	});

	it('refuses a role below the rank that grants a bit outside the mask', () => {
		const roles = [role({ id: 2, position: 2, allow: KICK | MANAGE })];
		expect(canAssignRole(roles[0], roles, actor)).toBe(false);
	});

	it('refuses a role whose out-of-mask bit is inherited from its parent', () => {
		const roles = [
			role({ id: 2, position: 1, allow: MANAGE }),
			role({ id: 3, position: 2, parent_id: 2 })
		];
		expect(canAssignRole(roles[1], roles, actor)).toBe(false);
	});
});

describe('wouldCycle', () => {
	const roles = [role({ id: 2 }), role({ id: 3, parent_id: 2 }), role({ id: 4, parent_id: 3 })];

	it.each([
		{ name: 'a descendant', id: 2, parent: 4, expected: true },
		{ name: 'itself', id: 2, parent: 2, expected: true },
		{ name: 'an ancestor', id: 4, parent: 2, expected: false },
		{ name: 'nothing', id: 3, parent: null, expected: false }
	])('wouldCycle is $expected for a parent of $name', ({ id, parent, expected }) => {
		expect(wouldCycle(id, parent, roles)).toBe(expected);
	});
});

describe('inheritedSource', () => {
	const roles = [
		role({ id: 2, name: 'Mod', allow: KICK }),
		role({ id: 3, name: 'Helper', parent_id: 2, deny: MANAGE }),
		role({ id: 4, name: 'Intern', parent_id: 3 })
	];

	it.each([
		{ bit: KICK, name: 'Mod', state: 'allow' },
		{ bit: MANAGE, name: 'Helper', state: 'deny' }
	])('finds $name as the nearest role in the chain that sets the bit', ({ bit, name, state }) => {
		expect(inheritedSource(roles[2], bit, roles)).toMatchObject({ role: { name }, state });
	});

	it('prefers the nearer role over a farther one', () => {
		const chain = [...roles, role({ id: 5, name: 'Lead', parent_id: 3, allow: MANAGE })];
		expect(inheritedSource(chain[3], MANAGE, chain)).toMatchObject({ role: { name: 'Helper' } });
	});

	it.each([
		{ name: 'nothing in the chain sets it', index: 2, bit: SEND },
		{ name: 'there is no parent', index: 0, bit: KICK }
	])('is null when $name', ({ index, bit }) => {
		expect(inheritedSource(roles[index], bit, roles)).toBeNull();
	});

	it('does not loop on a cycle', () => {
		const cyclic = [role({ id: 2, parent_id: 3 }), role({ id: 3, parent_id: 2 })];
		expect(inheritedSource(cyclic[0], KICK, cyclic)).toBeNull();
	});
});

describe('ownState', () => {
	it.each([
		{ allow: KICK, deny: 0n, expected: 'allow' },
		{ allow: 0n, deny: KICK, expected: 'deny' },
		{ allow: KICK, deny: KICK, expected: 'deny' },
		{ allow: 0n, deny: 0n, expected: 'inherit' }
	])('reads allow $allow and deny $deny as $expected', ({ allow, deny, expected }) => {
		expect(ownState(role({ id: 2, allow, deny }), KICK)).toBe(expected);
	});
});

describe('nameColor', () => {
	const roles = [
		everyone(),
		role({ id: 2, position: 1, color: '#111111' }),
		role({ id: 3, position: 3 }),
		role({ id: 4, position: 2, color: '#444444' })
	];

	it.each([
		{ assigned: [2, 3, 4], expected: '#444444' },
		{ assigned: [2], expected: '#111111' },
		{ assigned: [3], expected: null },
		{ assigned: [], expected: null }
	])('is $expected for the assigned roles $assigned', ({ assigned, expected }) => {
		expect(nameColor(roles, assigned)).toBe(expected);
	});
});

describe('assignedRoles', () => {
	it('lists assigned roles highest first and leaves out the default role', () => {
		const roles = [everyone(), role({ id: 2, position: 1 }), role({ id: 3, position: 2 })];
		expect(assignedRoles(roles, [1, 2, 3]).map((r) => r.id)).toEqual([3, 2]);
	});
});

describe('ordering', () => {
	it.each([
		{ id: 2, target: 5, side: 'before', expected: [2, 5, 4, 3] },
		{ id: 5, target: 3, side: 'after', expected: [4, 3, 5, 2] },
		{ id: 4, target: 4, side: 'after', expected: [5, 4, 3, 2] }
	] as const)('moves $id $side $target', ({ id, target, side, expected }) => {
		expect(moveRole([5, 4, 3, 2], id, target, side)).toEqual(expected);
	});

	it('numbers positions from the bottom', () => {
		expect(positionsForOrder([7, 8, 9])).toEqual([
			{ id: 7, position: 3 },
			{ id: 8, position: 2 },
			{ id: 9, position: 1 }
		]);
	});

	it('applies positions and sorts highest first', () => {
		const roles = [
			role({ id: 1, is_default: true }),
			role({ id: 2, position: 1 }),
			role({ id: 3, position: 2 })
		];
		const next = applyPositions(roles, [
			{ id: 2, position: 2 },
			{ id: 3, position: 1 }
		]);
		expect(next.map((r) => r.id)).toEqual([2, 3, 1]);
	});
});

describe('withoutRole', () => {
	it('drops the role and clears it as a parent', () => {
		const roles = [role({ id: 2 }), role({ id: 3, parent_id: 2 }), role({ id: 4, parent_id: 3 })];
		const next = withoutRole(roles, 2);
		expect(next.map((r) => r.id)).toEqual([3, 4]);
		expect(next.map((r) => r.parent_id)).toEqual([null, 3]);
	});
});
