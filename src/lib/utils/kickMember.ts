import { toast } from 'svelte-sonner';
import { has, Permission, rolesMask } from '$lib/permissions';
import { getErrorMessage } from '$lib/requests/errors';
import { removeServerMember } from '$lib/requests/servers/removeServerMember';
import { serversState } from '$lib/states/serversState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import type { User } from '$lib/types/auth.types';

/** Never yourself or the owner; a non-owner can't kick someone who could kick them. */
export function canKickMember(serverId: number, userId: number): boolean {
	const myId = usersState.loggedInUser?.id;
	const ownerId = serversState.servers[serverId]?.owner_id;
	if (
		!serversState.can(Permission.KICK_MEMBERS, serverId) ||
		userId === myId ||
		userId === ownerId
	) {
		return false;
	}
	if (ownerId != null && ownerId === myId) return true;
	const roles = serversState.roles[serverId] ?? [];
	const memberRoleIds = serversState.memberRoles[serverId]?.[userId] ?? [];
	return !has(rolesMask(roles, memberRoleIds), Permission.KICK_MEMBERS);
}

export async function kickMember(serverId: number, user: User): Promise<boolean> {
	try {
		await removeServerMember(serverId, user.id);
		serversState.removeMember(serverId, user.id);
		toast.success(`Kicked ${user.username}`);
		return true;
	} catch (e) {
		toast.error(`Couldn't kick ${user.username}: ${getErrorMessage(e)}`);
		return false;
	}
}
