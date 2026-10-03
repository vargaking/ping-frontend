import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import {
	CheckCheck,
	Copy,
	Link,
	LogOut,
	MessageSquare,
	Pencil,
	Reply,
	Settings,
	SmilePlus,
	Trash2,
	UserMinus,
	UserPlus
} from 'lucide-svelte';
import type { Icon } from 'lucide-svelte';
import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
import { Permission } from '$lib/permissions';
import { deleteMessage } from '$lib/requests/messages/deleteMessage';
import { getErrorMessage } from '$lib/requests/errors';
import { conversationsState } from '$lib/states/conversationsState.svelte';
import { messageEditState } from '$lib/states/messageEditState.svelte';
import { messagesState, messageThreadKey } from '$lib/states/messagesState.svelte';
import { overlayState } from '$lib/states/overlayState.svelte';
import { replyState } from '$lib/states/replyState.svelte';
import { serversState } from '$lib/states/serversState.svelte';
import { unreadState } from '$lib/states/unreadState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import type { VoiceMember } from '$lib/states/voiceRoster.svelte';
import type { User } from '$lib/types/auth.types';
import type { Channel } from '$lib/types/channel.types';
import type { MessageType } from '$lib/types/messages.types';
import type { Server } from '$lib/types/server.types';
import { db } from '$lib/utils/db';
import { canKickMember, kickMember } from '$lib/utils/kickMember';
import { confirmLeaveServer } from '$lib/utils/leaveServer';
import { messageClipboardText } from '$lib/utils/messageContent';
import { markRepliesDeleted } from '$lib/utils/replies';

export type MenuAction = {
	id: string;
	label: string;
	icon: typeof Icon;
	run: () => void | Promise<void>;
	destructive?: boolean;
	/** Neighbouring actions with different groups get a separator between them. */
	group?: string;
};

export function groupActions(actions: MenuAction[]): MenuAction[][] {
	const groups: MenuAction[][] = [];
	let previous: string | undefined;
	for (const action of actions) {
		if (groups.length === 0 || action.group !== previous) groups.push([]);
		groups[groups.length - 1].push(action);
		previous = action.group;
	}
	return groups;
}

async function copyToClipboard(text: string, what: string) {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(`${what} copied`);
	} catch {
		toast.error("Couldn't copy to the clipboard.");
	}
}

async function openDirectMessage(userId: number) {
	try {
		const conversation = await conversationsState.openWith(userId);
		await goto(`/app/direct/${conversation.id}/`);
	} catch (e) {
		toast.error(getErrorMessage(e));
	}
}

export function canEditMessage(message: MessageType): boolean {
	const me = usersState.loggedInUser;
	return me != null && me.id === message.user_id;
}

export function canDeleteMessage(message: MessageType): boolean {
	if (canEditMessage(message)) return true;
	// A DM has no moderators, so only the author can delete there.
	return (
		message.conversation_id == null &&
		serversState.can(Permission.MANAGE_MESSAGES, message.server_id)
	);
}

export function promptDeleteMessage(messageId: string) {
	overlayState.open(ConfirmDialog, {
		title: 'Delete message',
		description: 'This removes the message for everyone. This can’t be undone.',
		confirmLabel: 'Delete',
		destructive: true,
		onConfirm: async () => {
			try {
				await deleteMessage(messageId);
				messagesState.removeMessage(messageId);
				conversationsState.messageDeleted(messageId);
				await db.messages.delete(messageId);
				replyState.cancelFor(messageId);
				await markRepliesDeleted(messageId);
			} catch (e) {
				console.error('Failed to delete message', e);
			}
		}
	});
}

export function openChannelSettings(channelId: number) {
	overlayState.open(SettingsModal, { category: 'channel', channelId });
}

export function messageActions(
	message: MessageType,
	{ onReact }: { onReact?: () => void } = {}
): MenuAction[] {
	const actions: MenuAction[] = [
		{
			id: 'reply',
			label: 'Reply',
			icon: Reply,
			group: 'message',
			run: () => replyState.start(messageThreadKey(message), message)
		}
	];
	if (onReact) {
		actions.push({
			id: 'react',
			label: 'Add reaction',
			icon: SmilePlus,
			group: 'message',
			run: onReact
		});
	}
	const text = messageClipboardText(message.content);
	if (text) {
		actions.push({
			id: 'copy-text',
			label: 'Copy text',
			icon: Copy,
			group: 'message',
			run: () => copyToClipboard(text, 'Text')
		});
	}
	if (canEditMessage(message)) {
		actions.push({
			id: 'edit',
			label: 'Edit message',
			icon: Pencil,
			group: 'manage',
			run: () => messageEditState.start(message.id)
		});
	}
	if (canDeleteMessage(message)) {
		actions.push({
			id: 'delete',
			label: 'Delete message',
			icon: Trash2,
			group: 'danger',
			destructive: true,
			run: () => promptDeleteMessage(message.id)
		});
	}
	return actions;
}

export function channelActions(serverId: number, channel: Channel): MenuAction[] {
	const actions: MenuAction[] = [];
	if (channel.type === 'text') {
		if (unreadState.channelUnread(channel.id)) {
			actions.push({
				id: 'mark-read',
				label: 'Mark as read',
				icon: CheckCheck,
				group: 'channel',
				run: () => unreadState.markChannelRead(channel.id)
			});
		}
		actions.push({
			id: 'copy-link',
			label: 'Copy link',
			icon: Link,
			group: 'channel',
			run: () =>
				copyToClipboard(
					new URL(`/app/server/${serverId}/channel/${channel.id}/`, location.origin).href,
					'Link'
				)
		});
	}
	if (serversState.can(Permission.MANAGE_CHANNELS, serverId)) {
		actions.push({
			id: 'settings',
			label: 'Channel settings',
			icon: Settings,
			group: 'manage',
			run: () => openChannelSettings(channel.id)
		});
	}
	return actions;
}

/** Invite and settings open dialogs that work on the selected server, so they only show for it. */
export function serverActions(
	server: Server,
	{ onInvite }: { onInvite?: () => void } = {}
): MenuAction[] {
	const serverId = server.id;
	if (serverId == null) return [];
	const selected = serversState.selectedServerId === serverId;
	const me = usersState.loggedInUser;
	const actions: MenuAction[] = [];

	if (unreadState.serverUnread(serverId).unread) {
		actions.push({
			id: 'mark-read',
			label: 'Mark as read',
			icon: CheckCheck,
			group: 'read',
			run: () => unreadState.markServerRead(serverId)
		});
	}
	if (selected && onInvite && serversState.can(Permission.CREATE_INVITE, serverId)) {
		actions.push({
			id: 'invite',
			label: 'Invite people',
			icon: UserPlus,
			group: 'manage',
			run: onInvite
		});
	}
	if (selected) {
		actions.push({
			id: 'settings',
			label: 'Server settings',
			icon: Settings,
			group: 'manage',
			run: () => overlayState.open(SettingsModal, { category: 'server' })
		});
	}
	if (me != null && server.owner_id !== me.id) {
		actions.push({
			id: 'leave',
			label: 'Leave server',
			icon: LogOut,
			group: 'danger',
			destructive: true,
			run: () => confirmLeaveServer(serverId)
		});
	}
	return actions;
}

export function memberActions(serverId: number | null | undefined, user: User): MenuAction[] {
	const actions: MenuAction[] = [];
	if (usersState.loggedInUser?.id !== user.id) {
		actions.push({
			id: 'message',
			label: 'Message',
			icon: MessageSquare,
			group: 'user',
			run: () => openDirectMessage(user.id)
		});
	}
	actions.push({
		id: 'copy-username',
		label: 'Copy username',
		icon: Copy,
		group: 'user',
		run: () => copyToClipboard(user.username, 'Username')
	});
	if (serverId != null && canKickMember(serverId, user.id)) {
		actions.push({
			id: 'kick',
			label: 'Kick from server',
			icon: UserMinus,
			group: 'danger',
			destructive: true,
			run: () =>
				overlayState.open(ConfirmDialog, {
					title: `Kick ${user.username}?`,
					description:
						"They'll lose access to this server right away. They can rejoin with a new invite.",
					confirmLabel: 'Kick',
					destructive: true,
					onConfirm: async () => {
						await kickMember(serverId, user);
					}
				})
		});
	}
	return actions;
}

export function voiceParticipantActions(member: VoiceMember): MenuAction[] {
	if (member.self) return [];
	return [
		{
			id: 'message',
			label: 'Message',
			icon: MessageSquare,
			run: () => openDirectMessage(member.userId)
		}
	];
}
