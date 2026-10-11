import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Permission } from '$lib/permissions';
import { serversState } from '$lib/states/serversState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import type { Role, Server } from '$lib/types/server.types';
import type { User } from '$lib/types/auth.types';
import { canModerateMember } from './memberModeration';

const { KICK_MEMBERS: KICK, MANAGE_MESSAGES: MANAGE } = Permission;

const SERVER = 7;
const OWNER = 1;
const ME = 2;
const OTHER = 3;

const role = (id: number, allow: bigint, position: number, is_default = false): Role => ({
	id,
	name: `role ${id}`,
	allow: String(allow),
	deny: '0',
	parent_id: null,
	is_default,
	position,
	color: null
});

type Setup = { iAm: number; myMask: bigint; roles: Role[]; theirRoles: number[] };

function setup({ iAm = ME, myMask = KICK, roles = [], theirRoles = [] }: Partial<Setup> = {}) {
	usersState.loggedInUser = { id: iAm } as User;
	serversState.servers[SERVER] = { id: SERVER, owner_id: OWNER } as Server;
	serversState.setPermissions({ [SERVER]: String(myMask) });
	serversState.roles[SERVER] = roles;
	serversState.memberRoles[SERVER] = { [OTHER]: theirRoles };
}

beforeEach(() => {
	serversState.reset();
	serversState.roles = {};
	serversState.memberRoles = {};
});

afterEach(() => {
	usersState.reset();
});

describe('canModerateMember', () => {
	it('lets someone with the permission act on a member without it', () => {
		setup();
		expect(canModerateMember(SERVER, OTHER, KICK)).toBe(true);
	});

	it('refuses without the permission', () => {
		setup({ myMask: MANAGE });
		expect(canModerateMember(SERVER, OTHER, KICK)).toBe(false);
	});

	it('never acts on yourself', () => {
		setup();
		expect(canModerateMember(SERVER, ME, KICK)).toBe(false);
	});

	it('never acts on the owner', () => {
		setup();
		expect(canModerateMember(SERVER, OWNER, KICK)).toBe(false);
	});

	it('lets the owner act on anyone, even a member who holds the permission', () => {
		setup({
			iAm: OWNER,
			roles: [role(10, KICK, 1)],
			theirRoles: [10]
		});
		expect(canModerateMember(SERVER, OTHER, KICK)).toBe(true);
	});

	it('refuses a member who holds the same permission through a role', () => {
		setup({ roles: [role(10, KICK, 1)], theirRoles: [10] });
		expect(canModerateMember(SERVER, OTHER, KICK)).toBe(false);
	});

	it('refuses a member who holds it through the default role', () => {
		setup({ roles: [role(1, KICK, 0, true)] });
		expect(canModerateMember(SERVER, OTHER, KICK)).toBe(false);
	});

	it('allows a member whose roles hold only other permissions', () => {
		setup({ roles: [role(10, MANAGE, 1)], theirRoles: [10] });
		expect(canModerateMember(SERVER, OTHER, KICK)).toBe(true);
	});

	it('treats a member with unknown roles as having none', () => {
		setup();
		serversState.memberRoles[SERVER] = {};
		expect(canModerateMember(SERVER, OTHER, KICK)).toBe(true);
	});
});
