import { PUBLIC_WS_URL } from '$env/static/public';
import type { JSONContent } from '@tiptap/core';
import { usersState } from './usersState.svelte';
import { serversState } from './serversState.svelte';
import { voiceState } from './voiceState.svelte';
import {
	messagesState,
	messageThreadKey,
	channelThreadKey,
	directThreadKey
} from './messagesState.svelte';
import { conversationsState } from './conversationsState.svelte';
import { unreadState } from './unreadState.svelte';
import { notificationsState } from './notificationsState.svelte';
import { documentFocusState, type ActivityState } from '$lib/utils/documentFocus.svelte';
import { reportActivity } from '$lib/utils/push';
import { voicePresenceState } from './voicePresenceState.svelte';
import { playMentionChime, playMessageBlip } from '$lib/utils/notificationSound';
import { notifyChannelMessage, showThreadNotification } from '$lib/utils/desktopNotification';
import { channelTag, dmTag } from '$lib/utils/notificationTags';
import { messageMentionsUser, messagePreviewText } from '$lib/utils/messageContent';
import { db } from '$lib/utils/db';
import { channelRemoved } from '$lib/utils/channelRemoved';
import { serverRemoved } from '$lib/utils/serverRemoved';
import { getUser } from '$lib/requests/users/getUser';
import { v4 as uuidv4 } from 'uuid';
import type { MessageTarget, MessageType } from '$lib/types/messages.types';
import type { User } from '$lib/types/auth.types';
import type { Attachment } from '$lib/types/attachment.types';
import { toast } from 'svelte-sonner';
import { applyReaction } from '$lib/utils/reactions';

/** Server close code for "no valid session" (see /ws in ping-server). */
const WS_CLOSE_UNAUTHENTICATED = 4401;
const RECONNECT_DELAY_MS = 2000;

class SocketState {
	private socket: WebSocket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	connected: boolean = $state(false);
	/** The connection dropped and a reconnect is pending. */
	reconnecting: boolean = $state(false);
	private hasConnected = false;
	private activitySubscribed = false;

	/**
	 * Open the socket. The server identifies us from the session cookie during
	 * the handshake, so there is no init frame and no user id to send.
	 */
	connect() {
		if (this.socket) return;

		if (!this.activitySubscribed) {
			this.activitySubscribed = true;
			documentFocusState.attach();
			documentFocusState.onActivity((state) => {
				this.sendActivity(state);
				reportActivity(state);
			});
		}

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = window.location.host;
		const wsUrl = PUBLIC_WS_URL.startsWith('/')
			? `${protocol}//${host}${PUBLIC_WS_URL}`
			: PUBLIC_WS_URL;

		const socket = new WebSocket(wsUrl);
		this.socket = socket;

		socket.onopen = () => {
			console.log('WebSocket connection established');
			this.connected = true;
			this.reconnecting = false;

			// Voice frames sent while we were offline are gone, so refetch.
			const serverId = serversState.selectedServerId;
			if (this.hasConnected && serverId != null) voicePresenceState.load(serverId);
			this.hasConnected = true;

			this.sendActivity(documentFocusState.active ? 'active' : 'idle');
		};

		socket.onclose = (event) => {
			console.log('WebSocket connection closed', event.code);

			// A close event from a socket we already replaced or dropped on
			// purpose (see disconnect()) must not touch the current state.
			if (this.socket !== socket) return;

			this.socket = null;
			this.connected = false;

			if (event.code === WS_CLOSE_UNAUTHENTICATED) {
				// Session is gone or expired. Retrying would loop forever, so
				// hand over to the login page instead.
				usersState.setLoggedInUser(null);
				if (window.location.pathname.startsWith('/app')) {
					window.location.href = '/login/';
				}
				return;
			}

			this.reconnecting = true;
			this.reconnectTimer = setTimeout(() => {
				this.reconnectTimer = null;
				this.connect();
			}, RECONNECT_DELAY_MS);
		};

		socket.onmessage = (event) => {
			const data = JSON.parse(event.data);
			this.commSwitch(data);
		};

		socket.onerror = (error) => {
			console.error('WebSocket error:', error);
		};
	}

	private sendActivity(state: ActivityState) {
		if (this.socket?.readyState !== WebSocket.OPEN) return;
		this.socket.send(JSON.stringify({ type: 'activity', state }));
	}

	/** Close the socket and stay closed (e.g. on logout). Call connect() to reopen. */
	disconnect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		const socket = this.socket;
		this.socket = null;
		this.connected = false;
		this.reconnecting = false;
		socket?.close();
	}

	/** Returns false when the message could not go out, so the caller keeps it. */
	sendMessage(
		target: MessageTarget,
		message: JSONContent,
		attachments: Attachment[] = []
	): boolean {
		if (!message) return false;
		// Callers pass reactive state; IndexedDB can't store Svelte's proxies.
		attachments = $state.snapshot(attachments);
		// A socket can still report OPEN for a while after the network is gone.
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !navigator.onLine) {
			return false;
		}

		const user = usersState.loggedInUser;
		if (!user) return false;

		const id = uuidv4();
		const timestamp = new Date().toISOString();
		const attachmentIds = attachments.map((a) => a.id);

		const local: MessageType =
			target.kind === 'channel'
				? {
						id,
						server_id: target.serverId,
						channel_id: target.channelId,
						user_id: user.id,
						content: message,
						timestamp,
						attachments
					}
				: {
						id,
						conversation_id: target.conversationId,
						user_id: user.id,
						content: message,
						timestamp,
						attachments
					};

		const frame =
			target.kind === 'channel'
				? {
						type: 'message',
						id,
						server_id: target.serverId,
						channel_id: target.channelId,
						content: message,
						timestamp,
						attachment_ids: attachmentIds
					}
				: {
						type: 'direct_message',
						id,
						conversation_id: target.conversationId,
						content: message,
						timestamp,
						attachment_ids: attachmentIds
					};

		this.socket.send(JSON.stringify(frame));

		messagesState.addMessage(local);
		if (target.kind === 'direct') conversationsState.noteMessage(local, { mine: true });
		else unreadState.noteChannelMessage(target.channelId, target.serverId, id, { mine: true });

		// put, not add: the server can echo this same message to our other tabs
		// (or a retry could replay it), and a second add() would throw ConstraintError.
		db.messages.put(local).catch((err) => console.warn('Could not cache sent message:', err));
		return true;
	}

	async handleIncomingMessage(message: MessageType) {
		const me = usersState.loggedInUser;
		const mine = me != null && message.user_id === me.id;
		const channelId = message.channel_id;
		const serverId = message.server_id;

		const isCurrentThread =
			message.server_id == serversState.selectedServerId &&
			message.channel_id == serversState.selectedChannelId;
		if (isCurrentThread) {
			messagesState.addMessage(message);
		}

		// Sockets now fan out chat frames to every socket of every recipient
		// (minus the sender's own socket), so this can be our own message arriving
		// on another tab — put avoids a ConstraintError from the duplicate id.
		await db.messages.put(message);

		// Save timestamp to localstorage for message sync
		localStorage.setItem(`last_updated`, message.timestamp);

		if (channelId == null || serverId == null) return;

		const beingRead = unreadState.isBeingRead(channelThreadKey(channelId));
		const mentionsMe = !mine && me != null && messageMentionsUser(message.content, me.id);

		unreadState.noteChannelMessage(channelId, serverId, message.id, {
			mine,
			mentionsMe,
			read: beingRead
		});

		if (mine || beingRead) return;

		this.notifyIncoming({
			kind: 'channel',
			channelId,
			serverId,
			senderId: message.user_id,
			content: message.content,
			attachments: message.attachments,
			mentionsMe,
			messageUuid: message.id
		});
	}

	async handleIncomingDirectMessage(message: MessageType) {
		const me = usersState.loggedInUser;
		const mine = me != null && message.user_id === me.id;
		const conversationId = message.conversation_id;

		// Only append to threads already loaded; an unopened one fetches its
		// history (including this message) when opened.
		if (messagesState.has(messageThreadKey(message))) {
			messagesState.addMessage(message);
		}

		const beingRead =
			conversationId != null && unreadState.isBeingRead(directThreadKey(conversationId));
		conversationsState.noteMessage(message, { mine, read: beingRead });

		await db.messages.put(message);

		if (mine || beingRead || conversationId == null) return;

		this.notifyIncoming({
			kind: 'direct',
			conversationId,
			senderId: message.user_id,
			content: message.content,
			attachments: message.attachments,
			mentionsMe: false,
			messageUuid: message.id
		});
	}

	/** Shared notify + sound dispatch for a live message that isn't ours and
	 *  isn't in the thread we're currently reading. */
	private notifyIncoming(
		args:
			| {
					kind: 'channel';
					channelId: number;
					serverId: number;
					senderId: number;
					content: unknown;
					attachments?: Attachment[];
					mentionsMe: boolean;
					messageUuid: string;
			  }
			| {
					kind: 'direct';
					conversationId: number;
					senderId: number;
					content: unknown;
					attachments?: Attachment[];
					mentionsMe: boolean;
					messageUuid: string;
			  }
	) {
		if (notificationsState.sound) {
			if (args.kind === 'direct' || args.mentionsMe) playMentionChime();
			else playMessageBlip();
		}

		// Permission can be revoked in the browser at any time; re-read it so a
		// blocked notification is never attempted.
		notificationsState.refreshPermission();
		if (!notificationsState.desktop || notificationsState.permission !== 'granted') return;

		// Pushes for these share the page's tag and message id, so showing both
		// never duplicates; only a window the user is working in stays quiet.
		const pushedByServer = args.kind === 'direct' || args.mentionsMe;
		if (notificationsState.push === 'on' && pushedByServer && documentFocusState.active) return;

		const sender = usersState.users[args.senderId];
		const senderUsername = sender?.username ?? 'Someone';

		const body = messagePreviewText(args.content, args.attachments);

		if (args.kind === 'direct') {
			void showThreadNotification({
				tag: dmTag(args.conversationId),
				title: senderUsername,
				body,
				url: `/app/direct/${args.conversationId}/`,
				messageUuid: args.messageUuid,
				noun: 'messages'
			});
			return;
		}

		const server = serversState.servers[args.serverId];
		if (args.mentionsMe) {
			void showThreadNotification({
				tag: channelTag(args.channelId),
				title: `${senderUsername} in #${unreadState.channelName(args.channelId)}`,
				body,
				url: `/app/server/${args.serverId}/channel/${args.channelId}/`,
				messageUuid: args.messageUuid,
				noun: 'mentions'
			});
			return;
		}

		notifyChannelMessage({
			tag: channelThreadKey(args.channelId),
			channelName: unreadState.channelName(args.channelId),
			serverName: server?.name ?? '',
			senderUsername,
			content: args.content,
			attachments: args.attachments,
			href: `/app/server/${args.serverId}/channel/${args.channelId}/`
		});
	}

	async handleMessageUpdated(message: MessageType) {
		const changes = { content: message.content, edited_at: message.edited_at };
		const withAttachments = {
			...changes,
			...(message.attachments && { attachments: message.attachments }),
			...(message.reactions && { reactions: message.reactions })
		};
		messagesState.updateMessage(message.id, withAttachments);
		conversationsState.messageEdited(message.id, changes);
		await db.messages.update(message.id, withAttachments);
	}

	async handleMessageDeleted(message: { id: string }) {
		messagesState.removeMessage(message.id);
		conversationsState.messageDeleted(message.id);
		unreadState.messageDeleted(message.id);
		await db.messages.delete(message.id);
	}

	handleUserUpdate(user: User) {
		usersState.applyUser(user);
	}

	async handleUserInvalidate(userId: number) {
		try {
			const user = await getUser(userId);
			usersState.applyUser(user);
		} catch (error) {
			console.warn('Failed to refresh user after user_invalidate:', userId, error);
		}
	}

	/** Our read marker moved (from this tab's own PUT, or another one of our tabs). */
	handleReadState(frame: {
		channel_id: number | null;
		server_id: number | null;
		conversation_id: number | null;
		last_read_message_id: string;
	}) {
		if (frame.channel_id != null) {
			unreadState.applyChannelReadState(frame.channel_id, frame.last_read_message_id);
		} else if (frame.conversation_id != null) {
			conversationsState.applyReadState(frame.conversation_id, frame.last_read_message_id);
		}
	}

	sendSignal(signal: any) {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
		this.socket.send(JSON.stringify(signal));
	}

	commSwitch(message: any) {
		if (!message || !message.type) {
			console.warn('Invalid message format:', message);
			return;
		}

		switch (message.type) {
			case 'message':
				this.handleIncomingMessage(message);
				break;
			case 'direct_message':
				this.handleIncomingDirectMessage(message);
				break;
			case 'message_updated':
				this.handleMessageUpdated(message);
				break;
			case 'message_deleted':
				this.handleMessageDeleted(message);
				break;
			case 'reaction_added':
			case 'reaction_removed':
				applyReaction(
					message.message_id,
					message.emoji,
					message.user_id,
					message.type === 'reaction_added'
				);
				break;
			case 'user_updated':
				this.handleUserUpdate(message.user);
				break;
			case 'user_invalidate':
				this.handleUserInvalidate(message.user_id);
				break;
			case 'presence_update':
				if (message.online && message.user_id) {
					usersState.setUserOnline(message.user_id);
				} else if (message.user_id) {
					usersState.setUserOffline(message.user_id);
				}

				console.log('Presence update:', message.user_id, message.online ? 'online' : 'offline');
				break;
			case 'presence_init':
				usersState.setOnlineUsers(message.user_ids);
				break;
			case 'permissions_init':
				serversState.setPermissions(message.servers);
				break;
			case 'permissions_updated':
				serversState.setPermission(message.server_id, message.permissions);
				break;
			case 'member_roles_updated':
				serversState.setMemberRoles(message.server_id, message.user_id, message.role_ids);
				break;
			case 'channel_created':
				serversState.addChannel(message.server_id, message.channel);
				break;
			case 'channel_updated':
				serversState.updateChannel(message.server_id, message.channel);
				voiceState.renameChannel(message.channel.id, message.channel.name);
				break;
			case 'channel_deleted':
				channelRemoved(message.server_id, message.channel_id);
				break;
			case 'server_updated':
				serversState.patchServer(message.server.id, {
					name: message.server.name,
					server_profile: message.server.server_profile,
					...(message.server.server_settings && {
						server_settings: message.server.server_settings
					})
				});
				break;
			case 'server_deleted':
				serverRemoved(message.server_id, 'deleted');
				break;
			case 'member_joined':
				usersState.users[message.member.id] = message.member;
				serversState.addMember(message.server_id, message.member);
				break;
			case 'member_left':
				if (message.user_id === usersState.loggedInUser?.id) {
					serverRemoved(message.server_id, message.reason === 'kicked' ? 'kicked' : undefined);
				} else {
					serversState.removeMember(message.server_id, message.user_id);
				}
				break;
			case 'voice_state':
				voicePresenceState.apply(message.server_id, message.channel_id, message.participants);
				break;
			case 'read_state':
				this.handleReadState(message);
				break;
			case 'error':
				if (message.code === 'invalid_attachments' && message.ref) {
					// Nothing was stored server-side, so drop the optimistic copy.
					this.handleMessageDeleted({ id: message.ref });
					toast.error("Couldn't send the attachment. Try uploading it again.");
					break;
				}
				// e.g. { code: 'forbidden', ref: <message id> } when posting to a
				// server/channel we have no access to. Surfacing this in the UI
				// (failed-message state) is tracked separately.
				console.warn('Server rejected a frame:', message.code, message.ref);
				break;
			default:
				console.warn('Unknown message type:', message.type);
		}
	}
}

export const socketState = new SocketState();
