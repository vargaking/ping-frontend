import { describe, expect, it } from 'vitest';
import { Permission } from '$lib/permissions';
import type { Role } from '$lib/types/server.types';
import {
	applyPositions,
	assignedRoles,
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
	it('lets a child allow beat a parent deny', () => {
		const roles = [role({ id: 2, deny: KICK }), role({ id: 3, allow: KICK, parent_id: 2 })];
		expect(resolveRole(3, roles)).toEqual({ allow: KICK, deny: 0n });
	});

	it('lets a child deny beat a parent allow', () => {
		const roles = [
			role({ id: 2, allow: KICK | MANAGE }),
			role({ id: 3, deny: KICK, parent_id: 2 })
		];
		expect(resolveRole(3, roles)).toEqual({ allow: MANAGE, deny: KICK });
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
	it('denies the bit when Muted sits above a role that allows it', () => {
		const roles = [
			everyone(),
			role({ id: 2, position: 1, allow: SEND }),
			role({ id: 3, position: 2, deny: SEND })
		];
		expect(memberMask(roles, [2, 3]) & SEND).toBe(0n);
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

	it('lets a higher role that allows the bit beat a lower Muted', () => {
		const roles = [
			everyone(),
			role({ id: 2, position: 2, allow: SEND }),
			role({ id: 3, position: 1, deny: SEND })
		];
		expect(memberMask(roles, [2, 3]) & SEND).toBe(SEND);
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

describe('rankOf', () => {
	const roles = [
		everyone(),
		role({ id: 2, position: 1 }),
		role({ id: 3, position: 3 }),
		role({ id: 4, position: 2 })
	];

	it('is the highest position among the assigned roles', () => {
		expect(rankOf(roles, [2, 4])).toBe(2);
		expect(rankOf(roles, [4, 3, 2])).toBe(3);
	});

	it('is 0 without roles', () => {
		expect(rankOf(roles, [])).toBe(0);
		expect(rankOf(roles, [999])).toBe(0);
	});
});

describe('canTouchRole', () => {
	const mod = role({ id: 2, position: 2 });

	it('allows only roles strictly below the rank', () => {
		expect(canTouchRole(mod, 3, false)).toBe(true);
		expect(canTouchRole(mod, 2, false)).toBe(false);
		expect(canTouchRole(mod, 1, false)).toBe(false);
	});

	it('lets the owner touch anything', () => {
		expect(canTouchRole(mod, 0, true)).toBe(true);
	});
});

describe('wouldCycle', () => {
	const roles = [role({ id: 2 }), role({ id: 3, parent_id: 2 }), role({ id: 4, parent_id: 3 })];

	it('detects a loop through descendants and itself', () => {
		expect(wouldCycle(2, 4, roles)).toBe(true);
		expect(wouldCycle(2, 2, roles)).toBe(true);
	});

	it('allows unrelated or clearing parents', () => {
		expect(wouldCycle(4, 2, roles)).toBe(false);
		expect(wouldCycle(3, null, roles)).toBe(false);
	});
});

describe('inheritedSource', () => {
	const roles = [
		role({ id: 2, name: 'Mod', allow: KICK }),
		role({ id: 3, name: 'Helper', parent_id: 2, deny: MANAGE }),
		role({ id: 4, name: 'Intern', parent_id: 3 })
	];

	it('finds the nearest role in the chain that sets the bit', () => {
		expect(inheritedSource(roles[2], KICK, roles)).toMatchObject({
			role: { name: 'Mod' },
			state: 'allow'
		});
		expect(inheritedSource(roles[2], MANAGE, roles)).toMatchObject({
			role: { name: 'Helper' },
			state: 'deny'
		});
	});

	it('prefers the nearer role over a farther one', () => {
		const chain = [...roles, role({ id: 5, name: 'Lead', parent_id: 3, allow: MANAGE })];
		expect(inheritedSource(chain[3], MANAGE, chain)).toMatchObject({ role: { name: 'Helper' } });
	});

	it('is null when nothing in the chain sets it, or there is no parent', () => {
		expect(inheritedSource(roles[2], SEND, roles)).toBeNull();
		expect(inheritedSource(roles[0], KICK, roles)).toBeNull();
	});

	it('does not loop on a cycle', () => {
		const cyclic = [role({ id: 2, parent_id: 3 }), role({ id: 3, parent_id: 2 })];
		expect(inheritedSource(cyclic[0], KICK, cyclic)).toBeNull();
	});
});

describe('ownState', () => {
	it('reads deny before allow, and inherit when neither is set', () => {
		expect(ownState(role({ id: 2, allow: KICK }), KICK)).toBe('allow');
		expect(ownState(role({ id: 2, deny: KICK }), KICK)).toBe('deny');
		expect(ownState(role({ id: 2, allow: KICK, deny: KICK }), KICK)).toBe('deny');
		expect(ownState(role({ id: 2 }), KICK)).toBe('inherit');
	});
});

describe('nameColor', () => {
	const roles = [
		everyone(),
		role({ id: 2, position: 1, color: '#111111' }),
		role({ id: 3, position: 3 }),
		role({ id: 4, position: 2, color: '#444444' })
	];

	it('takes the colour of the highest assigned role that has one', () => {
		expect(nameColor(roles, [2, 3, 4])).toBe('#444444');
		expect(nameColor(roles, [2])).toBe('#111111');
	});

	it('is null without a coloured role', () => {
		expect(nameColor(roles, [3])).toBeNull();
		expect(nameColor(roles, [])).toBeNull();
	});
});

describe('assignedRoles', () => {
	it('lists assigned roles highest first and leaves out the default role', () => {
		const roles = [everyone(), role({ id: 2, position: 1 }), role({ id: 3, position: 2 })];
		expect(assignedRoles(roles, [1, 2, 3]).map((r) => r.id)).toEqual([3, 2]);
	});
});

describe('ordering', () => {
	it('moves a role next to another', () => {
		expect(moveRole([5, 4, 3, 2], 2, 5, 'before')).toEqual([2, 5, 4, 3]);
		expect(moveRole([5, 4, 3, 2], 5, 3, 'after')).toEqual([4, 3, 5, 2]);
		expect(moveRole([5, 4, 3, 2], 4, 4, 'after')).toEqual([5, 4, 3, 2]);
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
