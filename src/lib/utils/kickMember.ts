import { toast } from 'svelte-sonner';
import { Permission } from '$lib/permissions';
import { getErrorMessage } from '$lib/requests/errors';
import { removeServerMember } from '$lib/requests/servers/removeServerMember';
import { serversState } from '$lib/states/serversState.svelte';
import type { User } from '$lib/types/auth.types';
import { canModerateMember } from '$lib/utils/memberModeration';

export function canKickMember(serverId: number, userId: number): boolean {
	return canModerateMember(serverId, userId, Permission.KICK_MEMBERS);
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
