import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import {
	CheckCheck,
	FolderPlus,
	Copy,
	Link,
	Lock,
	LockOpen,
	LogOut,
	MessageSquare,
	MicOff,
	Pencil,
	Pin,
	PinOff,
	Plus,
	Reply,
	Settings,
	Shield,
	SmilePlus,
	Trash2,
	Unplug,
	UserMinus,
	UserPlus,
	Users,
	Volume2,
	VolumeX
} from 'lucide-svelte';
import type { Icon } from 'lucide-svelte';
import PeerVolumeDialog from '$lib/components/voice/PeerVolumeDialog.svelte';
import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
import { Permission } from '$lib/permissions';
import { deleteMessage } from '$lib/requests/messages/deleteMessage';
import { deleteForumPost } from '$lib/requests/forum/deleteForumPost';
import { updateForumPost } from '$lib/requests/forum/updateForumPost';
import { getErrorMessage } from '$lib/requests/errors';
import { conversationsState } from '$lib/states/conversationsState.svelte';
import { forumState } from '$lib/states/forumState.svelte';
import { membersPanelState } from '$lib/states/membersPanelState.svelte';
import { messageEditState } from '$lib/states/messageEditState.svelte';
import { messagesState, messageThreadKey } from '$lib/states/messagesState.svelte';
import { overlayState } from '$lib/states/overlayState.svelte';
import { phoneState } from '$lib/states/phoneState.svelte';
import { replyState } from '$lib/states/replyState.svelte';
import { serversState } from '$lib/states/serversState.svelte';
import { voiceState } from '$lib/states/voiceState.svelte';
import { unreadState } from '$lib/states/unreadState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import type { VoiceMember } from '$lib/states/voiceRoster.svelte';
import type { User } from '$lib/types/auth.types';
import type { Channel, ChannelGroup } from '$lib/types/channel.types';
import type { ForumPost, ForumPostUpdate } from '$lib/types/forum.types';
import type { MessageType } from '$lib/types/messages.types';
import type { Server } from '$lib/types/server.types';
import { db } from '$lib/utils/db';
import { confirmDeleteGroup, promptCreateGroup, promptRenameGroup } from '$lib/utils/channelGroups';
import { canKickMember, kickMember } from '$lib/utils/kickMember';
import { canModerateMember } from '$lib/utils/memberModeration';
import {
	assignableRoles,
	canAssign,
	canChangeRolesOf,
	setMemberRole
} from '$lib/utils/memberRoles';
import { disconnectMember, serverMuteMember } from '$lib/utils/voiceModeration';
import { confirmLeaveServer } from '$lib/utils/leaveServer';
import { messageClipboardText } from '$lib/utils/messageContent';
import { markRepliesDeleted } from '$lib/utils/replies';
import { channelPath, postPath } from '$lib/utils/channelRoutes';
import EditPostDialog from '$lib/components/forum/EditPostDialog.svelte';

type MenuBase = {
	id: string;
	label: string;
	icon: typeof Icon;
	/** Neighbouring entries with different groups get a separator between them. */
	group?: string;
};

export type MenuAction = MenuBase & {
	run: () => void | Promise<void>;
	destructive?: boolean;
};

export type MenuToggle = {
	id: string;
	label: string;
	checked: boolean;
	disabled?: boolean;
	color?: string | null;
	toggle: (checked: boolean) => void | Promise<void>;
};

/** Opens a list of checkboxes that stays open while they are toggled. */
export type MenuSubmenu = MenuBase & { toggles: MenuToggle[] };

export type MenuEntry = MenuAction | MenuSubmenu;

export function groupActions<T extends { group?: string }>(actions: T[]): T[][] {
	const groups: T[][] = [];
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
	return me != null && message.imported_author == null && me.id === message.user_id;
}

export function canDeleteMessage(message: MessageType): boolean {
	// The opening message goes with its post.
	if (message.post_id != null && forumState.openingMessageId(message.post_id) === message.id) {
		return false;
	}
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

export function canManagePost(post: ForumPost, serverId: number): boolean {
	const me = usersState.loggedInUser;
	return (
		(me != null && post.imported_author == null && post.author_id === me.id) ||
		serversState.can(Permission.MANAGE_MESSAGES, serverId)
	);
}

async function updatePost(post: ForumPost, update: ForumPostUpdate) {
	try {
		forumState.applyPost(await updateForumPost(post.id, update));
	} catch (e) {
		toast.error(`Couldn't update the post: ${getErrorMessage(e)}`);
	}
}

export function postActions(serverId: number, post: ForumPost): MenuAction[] {
	const actions: MenuAction[] = [
		{
			id: 'copy-link',
			label: 'Copy link',
			icon: Link,
			group: 'post',
			run: () =>
				copyToClipboard(
					new URL(postPath(serverId, post.channel_id, post.id), location.origin).href,
					'Link'
				)
		}
	];
	if (canManagePost(post, serverId)) {
		actions.push({
			id: 'edit',
			label: 'Edit title and tags',
			icon: Pencil,
			group: 'manage',
			run: () => overlayState.open(EditPostDialog, { post })
		});
	}
	if (serversState.can(Permission.MANAGE_MESSAGES, serverId)) {
		actions.push(
			{
				id: 'pin',
				label: post.pinned ? 'Unpin post' : 'Pin post',
				icon: post.pinned ? PinOff : Pin,
				group: 'manage',
				run: () => updatePost(post, { pinned: !post.pinned })
			},
			{
				id: 'lock',
				label: post.locked ? 'Unlock post' : 'Lock post',
				icon: post.locked ? LockOpen : Lock,
				group: 'manage',
				run: () => updatePost(post, { locked: !post.locked })
			}
		);
	}
	if (canManagePost(post, serverId)) {
		actions.push({
			id: 'delete',
			label: 'Delete post',
			icon: Trash2,
			group: 'danger',
			destructive: true,
			run: () =>
				overlayState.open(ConfirmDialog, {
					title: 'Delete post?',
					description:
						'This deletes the post and every reply to it for everyone. This can’t be undone.',
					confirmLabel: 'Delete',
					destructive: true,
					onConfirm: async () => {
						try {
							await deleteForumPost(post.id);
							forumState.applyPostDeleted(post.channel_id, post.id);
						} catch (e) {
							toast.error(`Couldn't delete the post: ${getErrorMessage(e)}`);
						}
					}
				})
		});
	}
	return actions;
}

export function channelActions(serverId: number, channel: Channel): MenuAction[] {
	const actions: MenuAction[] = [];
	if (channel.type !== 'voice') {
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
				copyToClipboard(new URL(channelPath(serverId, channel), location.origin).href, 'Link')
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

export function channelGroupActions(
	group: ChannelGroup,
	{ onCreateChannel }: { onCreateChannel: () => void }
): MenuAction[] {
	if (!serversState.can(Permission.MANAGE_CHANNELS, group.server_id)) return [];
	return [
		{
			id: 'create-channel',
			label: 'Create channel here',
			icon: Plus,
			group: 'channel',
			run: onCreateChannel
		},
		{
			id: 'rename',
			label: 'Rename category',
			icon: Pencil,
			group: 'manage',
			run: () => promptRenameGroup(group)
		},
		{
			id: 'delete',
			label: 'Delete category',
			icon: Trash2,
			group: 'danger',
			destructive: true,
			run: () => confirmDeleteGroup(group)
		}
	];
}

/** The member sheet closes on navigation, so it opens once the server's page is up. */
async function showMembers(serverId: number, selected: boolean) {
	if (!selected) await goto(`/app/server/${serverId}/`);
	phoneState.closeNav();
	membersPanelState.show();
}

/** Invite and settings open dialogs that work on the selected server, so they only show for it. */
export function serverActions(
	server: Server,
	{ onInvite, onCreateChannel }: { onInvite?: () => void; onCreateChannel?: () => void } = {}
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
	if (selected && serversState.can(Permission.MANAGE_CHANNELS, serverId)) {
		if (onCreateChannel) {
			actions.push({
				id: 'create-channel',
				label: 'Create channel',
				icon: Plus,
				group: 'manage',
				run: onCreateChannel
			});
		}
		actions.push({
			id: 'create-category',
			label: 'Create category',
			icon: FolderPlus,
			group: 'manage',
			run: () => promptCreateGroup(serverId)
		});
	}
	actions.push({
		id: 'members',
		label: 'Members',
		icon: Users,
		group: 'manage',
		run: () => showMembers(serverId, selected)
	});
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

export function memberActions(serverId: number | null | undefined, user: User): MenuEntry[] {
	const actions: MenuEntry[] = [];
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
	if (serverId != null && canChangeRolesOf(serverId, user.id)) {
		const assigned = new Set(serversState.memberRoles[serverId]?.[user.id] ?? []);
		actions.push({
			id: 'roles',
			label: 'Roles',
			icon: Shield,
			group: 'manage',
			toggles: assignableRoles(serverId).map((role) => ({
				id: String(role.id),
				label: role.name,
				color: role.color,
				checked: assigned.has(role.id),
				disabled: !canAssign(serverId, role),
				toggle: (checked) => setMemberRole(serverId, user, role, checked)
			}))
		});
	}
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
	const name = usersState.users[member.userId]?.username ?? member.fallbackName ?? 'this person';
	const actions: MenuAction[] = [
		{
			id: 'message',
			label: 'Message',
			icon: MessageSquare,
			group: 'user',
			run: () => openDirectMessage(member.userId)
		}
	];
	if (member.viewerInCall) {
		actions.push(
			{
				id: 'volume',
				label: 'Volume…',
				icon: Volume2,
				group: 'audio',
				run: () => overlayState.open(PeerVolumeDialog, { userId: member.userId, name })
			},
			{
				id: 'mute-for-me',
				label: member.localMuted ? 'Unmute for me' : 'Mute for me',
				icon: member.localMuted ? Volume2 : VolumeX,
				group: 'audio',
				run: () => voiceState.setPeerMuted(member.userId, !member.localMuted)
			}
		);
	}

	const serverId = member.serverId;
	if (serverId == null) return actions;
	if (canModerateMember(serverId, member.userId, Permission.MUTE_MEMBERS)) {
		actions.push({
			id: 'server-mute',
			label: member.serverMuted ? 'Remove server mute' : 'Server mute',
			icon: MicOff,
			group: 'moderate',
			run: () => serverMuteMember(serverId, member.userId, name, !member.serverMuted)
		});
	}
	if (canModerateMember(serverId, member.userId, Permission.MOVE_MEMBERS)) {
		actions.push({
			id: 'disconnect',
			label: 'Disconnect',
			icon: Unplug,
			group: 'danger',
			destructive: true,
			run: () =>
				overlayState.open(ConfirmDialog, {
					title: `Disconnect ${name}?`,
					description: 'They’re removed from the call and can rejoin.',
					confirmLabel: 'Disconnect',
					destructive: true,
					onConfirm: () => disconnectMember(serverId, member.userId, name)
				})
		});
	}
	return actions;
}
