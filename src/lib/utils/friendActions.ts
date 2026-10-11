import { toast } from 'svelte-sonner';
import { UserMinus, UserX } from 'lucide-svelte';
import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
import { getErrorMessage } from '$lib/requests/errors';
import { friendsState } from '$lib/states/friendsState.svelte';
import { overlayState } from '$lib/states/overlayState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import type { User } from '$lib/types/auth.types';
import type { MenuEntry } from '$lib/utils/menuActions';

/** Each of these toasts its own failure, so callers just await them. */
export async function addFriend(user: User) {
	try {
		await friendsState.request({ user_id: user.id });
	} catch (e) {
		toast.error(`Couldn't send the request: ${getErrorMessage(e)}`);
	}
}

export async function acceptFriend(user: User) {
	try {
		await friendsState.accept(user.id);
	} catch (e) {
		toast.error(getErrorMessage(e));
	}
}

export async function declineFriend(user: User) {
	try {
		await friendsState.decline(user.id);
	} catch (e) {
		toast.error(`Couldn't decline the request: ${getErrorMessage(e)}`);
	}
}

export async function cancelFriend(user: User) {
	try {
		await friendsState.cancel(user.id);
	} catch (e) {
		toast.error(`Couldn't cancel the request: ${getErrorMessage(e)}`);
	}
}

export function confirmRemoveFriend(user: User) {
	overlayState.open(ConfirmDialog, {
		title: `Remove ${user.username} as a friend?`,
		description: 'Your messages stay. You can add each other again later.',
		confirmLabel: 'Remove',
		destructive: true,
		onConfirm: async () => {
			try {
				await friendsState.remove(user.id);
			} catch (e) {
				toast.error(`Couldn't remove the friend: ${getErrorMessage(e)}`);
			}
		}
	});
}

/** The friend entries of a profile card's overflow; the Add friend button covers the rest. */
export function friendCardActions(user: User): MenuEntry[] {
	if (!friendsState.loaded || usersState.loggedInUser?.id === user.id) return [];
	switch (friendsState.stateOf(user.id)) {
		case 'outgoing':
			return [
				{
					id: 'cancel-friend-request',
					label: 'Cancel friend request',
					icon: UserX,
					group: 'friend',
					run: () => cancelFriend(user)
				}
			];
		case 'incoming':
			return [
				{
					id: 'decline-friend-request',
					label: 'Decline friend request',
					icon: UserX,
					group: 'friend',
					run: () => declineFriend(user)
				}
			];
		case 'friends':
			return [
				{
					id: 'remove-friend',
					label: 'Remove friend',
					icon: UserMinus,
					group: 'danger',
					destructive: true,
					run: () => confirmRemoveFriend(user)
				}
			];
		default:
			return [];
	}
}
