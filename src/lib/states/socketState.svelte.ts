import { PUBLIC_WS_URL } from '$env/static/public';
import type { JSONContent } from '@tiptap/core';
import { usersState } from './usersState.svelte';
import { serversState } from './serversState.svelte';
import { messagesState, messageThreadKey } from './messagesState.svelte';
import { conversationsState } from './conversationsState.svelte';
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
		if (target.kind === 'direct') conversationsState.noteMessage(local);

		await db.messages.add(local);
	}

	async handleIncomingMessage(message: MessageType) {
		const selectedServer = serversState.selectedServer;
		const selectedChannel = serversState.selectedChannel;

		if (message.server_id == selectedServer?.id && message.channel_id == selectedChannel?.id) {
			messagesState.addMessage(message);
		}

		await db.messages.add(message);

		// Save timestamp to localstorage for message sync
		localStorage.setItem(`last_updated`, message.timestamp);
	}

	async handleIncomingDirectMessage(message: MessageType) {
		// Only append to threads already loaded; an unopened one fetches its
		// history (including this message) when opened.
		if (messagesState.has(messageThreadKey(message))) {
			messagesState.addMessage(message);
		}
		conversationsState.noteMessage(message);

		await db.messages.put(message);
	}

	async handleMessageUpdated(message: MessageType) {
		messagesState.updateMessage(message.id, {
			content: message.content,
			edited_at: message.edited_at
		});
		await db.messages.update(message.id, {
			content: message.content,
			edited_at: message.edited_at
		});
	}

	async handleMessageDeleted(message: { id: string }) {
		messagesState.removeMessage(message.id);
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
