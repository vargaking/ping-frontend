import { has, rolesMask } from '$lib/permissions';
import { serversState } from '$lib/states/serversState.svelte';
import { usersState } from '$lib/states/usersState.svelte';

/** Never yourself or the owner; a non-owner can't act on someone who holds the same permission. */
export function canModerateMember(serverId: number, userId: number, perm: bigint): boolean {
	const myId = usersState.loggedInUser?.id;
	const ownerId = serversState.servers[serverId]?.owner_id;
	if (!serversState.can(perm, serverId) || userId === myId || userId === ownerId) return false;
	if (ownerId != null && ownerId === myId) return true;
	const roles = serversState.roles[serverId] ?? [];
	const memberRoleIds = serversState.memberRoles[serverId]?.[userId] ?? [];
	return !has(rolesMask(roles, memberRoleIds), perm);
}
