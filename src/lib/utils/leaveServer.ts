import { toast } from 'svelte-sonner';
import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
import { getErrorMessage } from '$lib/requests/errors';
import { removeServerMember } from '$lib/requests/servers/removeServerMember';
import { overlayState } from '$lib/states/overlayState.svelte';
import { serversState } from '$lib/states/serversState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import { serverRemoved } from '$lib/utils/serverRemoved';

export function confirmLeaveServer(serverId: number) {
	const server = serversState.servers[serverId];
	const me = usersState.loggedInUser;
	if (!server || !me) return;
	overlayState.open(ConfirmDialog, {
		title: `Leave ${server.name}?`,
		description: "You won't be able to rejoin unless someone invites you again.",
		confirmLabel: 'Leave server',
		destructive: true,
		onConfirm: async () => {
			try {
				await removeServerMember(serverId, me.id);
			} catch (e) {
				toast.error(`Couldn't leave the server: ${getErrorMessage(e)}`);
				return;
			}
			await serverRemoved(serverId);
			toast.success(`Left ${server.name}`);
		}
	});
}
