import { toast } from 'svelte-sonner';
import { Permission } from '$lib/permissions';
import { getErrorMessage } from '$lib/requests/errors';
import { updateMemberRoles } from '$lib/requests/servers/updateMemberRoles';
import { serversState } from '$lib/states/serversState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import type { User } from '$lib/types/auth.types';
import type { Role } from '$lib/types/server.types';
import { canAssignRole } from '$lib/utils/roles';

/** Roles that can be assigned in a server: all but the default, highest first. */
export function assignableRoles(serverId: number): Role[] {
	return (serversState.roles[serverId] ?? []).filter((r) => !r.is_default);
}

/** MANAGE_ROLES, never yourself or the owner, and there is something to assign. */
export function canChangeRolesOf(serverId: number, userId: number): boolean {
	return (
		serversState.can(Permission.MANAGE_ROLES, serverId) &&
		userId !== usersState.loggedInUser?.id &&
		userId !== serversState.servers[serverId]?.owner_id &&
		assignableRoles(serverId).length > 0
	);
}

export function canAssign(serverId: number, role: Role): boolean {
	return canAssignRole(role, serversState.roles[serverId] ?? [], {
		rank: serversState.rankIn(serverId),
		isOwner: serversState.isOwner(serverId),
		mask: serversState.maskOf(serverId)
	});
}

export async function setMemberRole(
	serverId: number,
	user: User,
	role: Role,
	assigned: boolean
): Promise<void> {
	const previous = serversState.memberRoles[serverId]?.[user.id] ?? [];
	const next = previous.filter((id) => id !== role.id);
	if (assigned) next.push(role.id);
	serversState.setMemberRoles(serverId, user.id, next);
	try {
		const updated = await updateMemberRoles(serverId, user.id, next);
		serversState.setMemberRoles(serverId, user.id, updated.role_ids);
	} catch (e) {
		serversState.setMemberRoles(serverId, user.id, previous);
		toast.error(`Couldn't change ${user.username}'s roles: ${getErrorMessage(e)}`);
	}
}
