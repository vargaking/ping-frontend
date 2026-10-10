import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, CHANNEL_BITS, Permission } from '$lib/permissions';
import type { Overwrites } from '$lib/types/overwrite.types';
import type { Role } from '$lib/types/server.types';
import {
	canView,
	isPrivate,
	privateRow,
	scopeMask,
	visibleTo,
	type MemberInfo,
	type Scope,
	type Who
} from './channelResolution';

const {
	VIEW_CHANNEL: VIEW,
	SEND_MESSAGES: SEND,
	MANAGE_MESSAGES: MANAGE,
	CONNECT,
	SPEAK,
	STREAM,
	CREATE_INVITE,
	MANAGE_ROLES,
	MANAGE_SERVER
} = Permission;
const MEMBER = VIEW | SEND | CONNECT | SPEAK | STREAM | CREATE_INVITE;

type Spec = Partial<Omit<Role, 'allow' | 'deny'>> & { id: number; allow?: bigint; deny?: bigint };

function role({ allow = 0n, deny = 0n, ...rest }: Spec): Role {
	return {
		name: `R${rest.id}`,
		parent_id: null,
		is_default: false,
		position: 0,
		color: null,
		...rest,
		allow: String(allow),
		deny: String(deny)
	};
}

const EVERYONE = role({ id: 1, name: '@everyone', allow: MEMBER, is_default: true });
const MOD = role({ id: 2, name: 'Mod', position: 1, allow: MANAGE });
const JUNIOR = role({ id: 3, name: 'Junior', position: 2, parent_id: 2 });
const ROLES = [EVERYONE, MOD, JUNIOR];

type Pairs = Record<number, [allow: bigint, deny: bigint]>;

function rows(roleRows: Pairs = {}, memberRows: Pairs = {}): Overwrites {
	const list = (pairs: Pairs) =>
		Object.entries(pairs).map(([id, [allow, deny]]) => ({
			id: Number(id),
			allow: String(allow),
			deny: String(deny)
		}));
	return {
		roles: list(roleRows).map(({ id, allow, deny }) => ({ role_id: id, allow, deny })),
		members: list(memberRows).map(({ id, allow, deny }) => ({ user_id: id, allow, deny }))
	};
}

const NO_ROWS = rows();
const USER = 9;

function scope(
	target: Overwrites,
	category: Overwrites | null = null,
	extra: Partial<Scope> = {}
): Scope {
	return {
		roles: ROLES,
		ownerId: 100,
		target,
		category: category ? { name: 'Staff', rows: category } : null,
		...extra
	};
}

const holding = (...roleIds: number[]): Who => ({ userId: USER, roleIds });

describe('scopeMask', () => {
	it('is the server mask when no row changes anything', () => {
		const both = scopeMask(scope(NO_ROWS, NO_ROWS), holding(2));
		expect(both).toBe(MEMBER | MANAGE);
		expect(scopeMask(scope(NO_ROWS), holding(2))).toBe(MEMBER | MANAGE);
	});

	it('lets a higher role allow back what a deny for @everyone took away', () => {
		const target = rows({ 1: [0n, VIEW], 2: [VIEW, 0n] });
		expect(scopeMask(scope(target), holding()) & VIEW).toBe(0n);
		expect(scopeMask(scope(target), holding(2)) & VIEW).toBe(VIEW);
	});

	it('lets the highest role that says anything about a bit decide it', () => {
		const target = rows({ 2: [SEND, 0n], 3: [0n, SEND] });
		expect(scopeMask(scope(target), holding(2, 3)) & SEND).toBe(0n);
	});

	it("gives a role without a row its parent's row", () => {
		const target = rows({ 1: [0n, VIEW], 2: [VIEW, 0n] });
		expect(scopeMask(scope(target), holding(3)) & VIEW).toBe(VIEW);
	});

	it('lets the member row beat roles', () => {
		const target = rows({ 2: [VIEW, 0n] }, { [USER]: [0n, VIEW] });
		expect(scopeMask(scope(target), holding(2)) & VIEW).toBe(0n);
	});

	it('lets the channel beat the category', () => {
		const category = rows({ 1: [0n, VIEW] });
		const channel = rows({}, { [USER]: [VIEW, 0n] });
		expect(scopeMask(scope(NO_ROWS, category), holding()) & CHANNEL_BITS).toBe(0n);
		expect(scopeMask(scope(channel, category), holding()) & VIEW).toBe(VIEW);
		expect(scopeMask(scope(rows({}, { [USER]: [0n, VIEW] }), NO_ROWS), holding()) & VIEW).toBe(0n);
	});

	it('clears every channel bit without View but keeps the server bits', () => {
		const roles = [EVERYONE, role({ id: 2, position: 1, allow: MANAGE_ROLES }), JUNIOR];
		const result = scopeMask(scope(rows({ 1: [0n, VIEW] }), null, { roles }), holding(2));
		expect(result & CHANNEL_BITS).toBe(0n);
		expect(result & MANAGE_ROLES).toBe(MANAGE_ROLES);
	});

	it('moves only channel bits', () => {
		const target = rows({ 1: [MANAGE_SERVER, 0n] });
		expect(scopeMask(scope(target), holding()) & MANAGE_SERVER).toBe(0n);
	});

	it('gives the owner everything', () => {
		const target = rows({ 1: [0n, VIEW] });
		expect(scopeMask(scope(target), { userId: 100, roleIds: [] })).toBe(ALL_PERMISSIONS);
	});

	it('ignores rows of roles that no longer exist', () => {
		expect(scopeMask(scope(rows({ 77: [0n, VIEW] })), holding())).toBe(MEMBER);
	});

	it("applies @everyone's deny on top of what the server mask grants", () => {
		const target = rows({ 1: [0n, SEND] });
		expect(scopeMask(scope(target), holding()) & SEND).toBe(0n);
	});
});

describe('canView', () => {
	it('follows the View bit of the mask', () => {
		const target = rows({ 1: [0n, VIEW] });
		expect(canView(scope(target), holding())).toBe(false);
		expect(canView(scope(target), { userId: 100, roleIds: [] })).toBe(true);
	});
});

describe('isPrivate', () => {
	it('is on when @everyone is denied View on the target', () => {
		expect(isPrivate(scope(rows({ 1: [0n, VIEW] })))).toBe(true);
		expect(isPrivate(scope(rows({ 1: [0n, SEND] })))).toBe(false);
		expect(isPrivate(scope(NO_ROWS))).toBe(false);
	});

	it('is inherited from a private category', () => {
		expect(isPrivate(scope(NO_ROWS, rows({ 1: [0n, VIEW] })))).toBe(true);
	});

	it('is undone by an @everyone allow on the channel', () => {
		const category = rows({ 1: [0n, VIEW] });
		expect(isPrivate(scope(rows({ 1: [VIEW, 0n] }), category))).toBe(false);
	});

	it('is on when @everyone lacks View on the server and no row gives it back', () => {
		const roles = [role({ id: 1, name: '@everyone', allow: SEND, is_default: true }), MOD];
		expect(isPrivate(scope(NO_ROWS, null, { roles }))).toBe(true);
		expect(isPrivate(scope(rows({ 1: [VIEW, 0n] }), null, { roles }))).toBe(false);
	});

	it('is not undone by a role or member row', () => {
		const target = rows({ 1: [0n, VIEW], 2: [VIEW, 0n] }, { [USER]: [VIEW, 0n] });
		expect(isPrivate(scope(target))).toBe(true);
	});
});

describe('visibleTo', () => {
	const members: MemberInfo[] = [
		{ id: 100, username: 'owner', roleIds: [] },
		{ id: 10, username: 'ann', roleIds: [] },
		{ id: 11, username: 'bob', roleIds: [] },
		{ id: 12, username: 'cat', roleIds: [2] }
	];
	const names = (list: { name: string }[]) => list.map((r) => r.name);

	it('lists a role with an allow row, highest first', () => {
		const target = rows({ 1: [0n, VIEW], 2: [VIEW, 0n] });
		expect(names(visibleTo(scope(target), members).roles)).toEqual(['Junior', 'Mod']);
	});

	it('does not list a role that only has View on the server when @everyone is denied', () => {
		const other = role({ id: 4, name: 'Other', position: 3 });
		const target = rows({ 1: [0n, VIEW], 2: [VIEW, 0n] });
		const roles = [...ROLES, other];
		expect(names(visibleTo(scope(target, null, { roles }), members).roles)).toEqual([
			'Junior',
			'Mod'
		]);
	});

	it('lists a child of an allowed parent', () => {
		const target = rows({ 1: [0n, VIEW], 2: [VIEW, 0n] });
		expect(names(visibleTo(scope(target), members).roles)).toContain('Junior');
	});

	it('lists a member with an allow row, never the owner', () => {
		const target = rows({ 1: [0n, VIEW] }, { 10: [VIEW, 0n], 100: [VIEW, 0n] });
		expect(visibleTo(scope(target), members).members.map((m) => m.username)).toEqual(['ann']);
	});

	it('lists a member who is allowed in the category', () => {
		const category = rows({ 1: [0n, VIEW] }, { 11: [VIEW, 0n] });
		expect(visibleTo(scope(NO_ROWS, category), members).members.map((m) => m.id)).toEqual([11]);
	});

	it('does not list a member whose channel row takes View away again', () => {
		const category = rows({ 1: [0n, VIEW] }, { 11: [VIEW, 0n] });
		const target = rows({}, { 11: [0n, VIEW] });
		expect(visibleTo(scope(target, category), members).members).toEqual([]);
	});

	it("does not list a role whose category allow is overridden by the channel's @everyone deny", () => {
		const category = rows({ 2: [VIEW, 0n] });
		const target = rows({ 1: [0n, VIEW] });
		expect(visibleTo(scope(target, category), members).roles).toEqual([]);
	});

	it('does not list a member who only has an allow row for another bit', () => {
		const target = rows({ 1: [0n, VIEW] }, { 10: [SEND, 0n] });
		expect(visibleTo(scope(target), members).members).toEqual([]);
	});
});

describe('privateRow', () => {
	const everyone = 1;

	it('denies View for @everyone and keeps the other bits of the row', () => {
		const target = rows({ 1: [SEND, MANAGE] });
		expect(privateRow(scope(target), everyone, true)).toEqual({ allow: SEND, deny: MANAGE | VIEW });
	});

	it('goes back to inherit when that makes the target public', () => {
		const target = rows({ 1: [0n, VIEW | SEND] });
		expect(privateRow(scope(target), everyone, false)).toEqual({ allow: 0n, deny: SEND });
	});

	it('allows View when the category keeps the channel private', () => {
		const category = rows({ 1: [0n, VIEW] });
		expect(privateRow(scope(NO_ROWS, category), everyone, false)).toEqual({
			allow: VIEW,
			deny: 0n
		});
	});

	it('allows View when @everyone lacks it on the server', () => {
		const roles = [role({ id: 1, name: '@everyone', allow: SEND, is_default: true }), MOD];
		expect(privateRow(scope(NO_ROWS, null, { roles }), everyone, false)).toEqual({
			allow: VIEW,
			deny: 0n
		});
	});

	it('makes the target match the click either way', () => {
		const target = rows({ 1: [SEND, 0n] });
		const on = privateRow(scope(target), everyone, true);
		const withOn = rows({ 1: [on.allow, on.deny] });
		expect(isPrivate(scope(withOn))).toBe(true);
		const off = privateRow(scope(withOn), everyone, false);
		expect(isPrivate(scope(rows({ 1: [off.allow, off.deny] })))).toBe(false);
	});
});
