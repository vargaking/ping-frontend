import { PUBLIC_WS_URL } from '$env/static/public';
import type { JSONContent } from '@tiptap/core';
import { usersState } from './usersState.svelte';
import { serversState } from './serversState.svelte';
import {
	messagesState,
	messageThreadKey,
	channelThreadKey,
	directThreadKey
} from './messagesState.svelte';
import { conversationsState } from './conversationsState.svelte';
import { unreadState } from './unreadState.svelte';
import { notificationsState } from './notificationsState.svelte';
import { playMentionChime, playMessageBlip } from '$lib/utils/notificationSound';
import { notifyChannelMessage, notifyDirectMessage } from '$lib/utils/desktopNotification';
import { messageMentionsUser } from '$lib/utils/messageContent';
import { db } from '$lib/utils/db';
import { v4 as uuidv4 } from 'uuid';
import type { MessageTarget, MessageType } from '$lib/types/messages.types';
import type { User } from '$lib/types/auth.types';

/** Server close code for "no valid session" (see /ws in ping-server). */
const WS_CLOSE_UNAUTHENTICATED = 4401;
const RECONNECT_DELAY_MS = 2000;

class SocketState {
	private socket: WebSocket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	connected: boolean = $state(false);

	/**
	 * Open the socket. The server identifies us from the session cookie during
	 * the handshake, so there is no init frame and no user id to send.
	 */
	connect() {
		if (this.socket) return;

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

	/** Close the socket and stay closed (e.g. on logout). Call connect() to reopen. */
	disconnect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		const socket = this.socket;
		this.socket = null;
		this.connected = false;
		socket?.close();
	}

	async sendMessage(target: MessageTarget, message: JSONContent) {
		if (!message) return;
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			console.warn('WebSocket is not connected. Message not sent:', message);
			return;
		}

		const user = usersState.loggedInUser;
		if (!user) {
			console.warn('Cannot send message without a logged-in user.');
			return;
		}

		const id = uuidv4();
		const timestamp = new Date().toISOString();

		const local: MessageType =
			target.kind === 'channel'
				? {
						id,
						server_id: target.serverId,
						channel_id: target.channelId,
						user_id: user.id,
						content: message,
						timestamp
					}
				: {
						id,
						conversation_id: target.conversationId,
						user_id: user.id,
						content: message,
						timestamp
					};

		const frame =
			target.kind === 'channel'
				? {
						type: 'message',
						id,
						server_id: target.serverId,
						channel_id: target.channelId,
						content: message,
						timestamp
					}
				: {
						type: 'direct_message',
						id,
						conversation_id: target.conversationId,
						content: message,
						timestamp
					};

		this.socket.send(JSON.stringify(frame));

		messagesState.addMessage(local);
		if (target.kind === 'direct') conversationsState.noteMessage(local, { mine: true });
		else unreadState.noteChannelMessage(target.channelId, target.serverId, id, { mine: true });

		// put, not add: the server can echo this same message to our other tabs
		// (or a retry could replay it), and a second add() would throw ConstraintError.
		await db.messages.put(local);
	}

	async handleIncomingMessage(message: MessageType) {
		const selectedServer = serversState.selectedServer;
		const selectedChannel = serversState.selectedChannel;
		const me = usersState.loggedInUser;
		const mine = me != null && message.user_id === me.id;
		const channelId = message.channel_id;
		const serverId = message.server_id;

		const isCurrentThread =
			message.server_id == selectedServer?.id && message.channel_id == selectedChannel?.id;
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
			mentionsMe
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
			mentionsMe: false
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
					mentionsMe: boolean;
			  }
			| {
					kind: 'direct';
					conversationId: number;
					senderId: number;
					content: unknown;
					mentionsMe: boolean;
			  }
	) {
		if (notificationsState.sound) {
			if (args.kind === 'direct' || args.mentionsMe) playMentionChime();
			else playMessageBlip();
		}

		if (!notificationsState.desktop || notificationsState.permission !== 'granted') return;

		const sender = usersState.users[args.senderId];
		const senderUsername = sender?.username ?? 'Someone';

		if (args.kind === 'direct') {
			notifyDirectMessage({
				tag: directThreadKey(args.conversationId),
				senderUsername,
				content: args.content,
				href: `/app/direct/${args.conversationId}/`
			});
			return;
		}

		const server = serversState.servers[args.serverId];
		const channel = serversState.selectedServerChannels[args.channelId];
		notifyChannelMessage({
			tag: channelThreadKey(args.channelId),
			channelName: channel?.name ?? '',
			serverName: server?.name ?? '',
			senderUsername,
			content: args.content,
			href: `/app/server/${args.serverId}/channel/${args.channelId}/`
		});
	}

	async handleMessageUpdated(message: MessageType) {
		const changes = { content: message.content, edited_at: message.edited_at };
		messagesState.updateMessage(message.id, changes);
		conversationsState.messageEdited(message.id, changes);
		await db.messages.update(message.id, {
			content: message.content,
			edited_at: message.edited_at
		});
	}

	async handleMessageDeleted(message: { id: string }) {
		messagesState.removeMessage(message.id);
		conversationsState.messageDeleted(message.id);
		await db.messages.delete(message.id);
	}

	async handleUserUpdate(user: User) {
		console.log('Received user update:', user);

		// Update users state
		usersState.users[user.id] = user;

		// Update loggedInUser if it's me
		const currentUser = usersState.loggedInUser;
		if (currentUser && currentUser.id === user.id) {
			usersState.setLoggedInUser(user);
		}

		// Update IndexedDB
		//await db.users.put(user);
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
			case 'user_updated':
				this.handleUserUpdate(message.user);
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
			case 'channel_created':
				serversState.addChannel(message.server_id, message.channel);
				break;
			case 'member_joined':
				usersState.users[message.member.id] = message.member;
				serversState.addMember(message.server_id, message.member);
				break;
			case 'read_state':
				this.handleReadState(message);
				break;
			case 'error':
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
