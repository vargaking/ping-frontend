import { PUBLIC_WS_URL } from '$env/static/public';
import { usersState } from './usersState.svelte';
import { serversState } from './serversState.svelte';
import { messagesState } from './messagesState.svelte';
import { db } from '$lib/utils/db';
import { v4 as uuidv4 } from 'uuid';
import type { MessageType } from '$lib/types/messages.types';
import type { User } from '$lib/types/auth.types';

class SocketState {
	private socket: WebSocket | null = null;
	connected: boolean = $state(false);

	connect() {
		if (this.connected) return;

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = window.location.host;
		const wsUrl = PUBLIC_WS_URL.startsWith('/')
			? `${protocol}//${host}${PUBLIC_WS_URL}`
			: PUBLIC_WS_URL;

		const socket = new WebSocket(wsUrl);
		this.socket = socket;

		this.socket.onopen = () => {
			console.log('WebSocket connection established');
			this.connected = true;
			this.sendInit();
		};

		this.socket.onclose = () => {
			console.log('WebSocket connection closed');
			this.connected = false;

			setTimeout(() => {
				this.socket = null;
				this.connect();
			}, 2000);
		};

		this.socket.onmessage = (event) => {
			const data = JSON.parse(event.data);
			this.commSwitch(data);
		};

		this.socket.onerror = (error) => {
			console.error('WebSocket error:', error);
		};
	}

	disconnect() {
		if (this.socket) {
			this.socket.close();
			this.socket = null;
			this.connected = false;

			setTimeout(() => {
				this.connect();
			}, 2000);
		}
	}

	sendInit() {
		const user = usersState.loggedInUser;

		console.debug('SocketState sendInit called with user:', user);

		if (!user || !user.id) return;

		console.debug('Sending connection_init for user:', user);

		this.socket?.send(JSON.stringify({ type: 'connection_init', user_id: user.id }));
	}

	async sendMessage(message: unknown) {
		if (!message) return;
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			console.warn('WebSocket is not connected. Message not sent:', message);
			return;
		}

		const user = usersState.loggedInUser;
		const server = serversState.selectedServer;
		const channel = serversState.selectedChannel;

		if (!user || !server || !channel) {
			console.warn('Cannot send message. Missing user, server, or channel information.');
			console.debug('User:', user, 'Server:', server, 'Channel:', channel);
			return;
		}

		console.debug(
			'Sending message:',
			message,
			'from user:',
			user,
			'to server:',
			server,
			'channel:',
			channel
		);

		if (!server.id || !channel.id) return;

		const uuid = uuidv4();
		const timestamp = new Date().toISOString();

		this.socket?.send(
			JSON.stringify({
				type: 'message',
				id: uuid,
				server_id: server.id,
				channel_id: channel.id,
				user_id: user.id,
				content: message,
				timestamp: timestamp
			})
		);

		messagesState.addMessage({
			id: uuid,
			server_id: server.id,
			channel_id: channel.id,
			user_id: user.id,
			content: message,
			timestamp: timestamp
		});

		await db.messages.add({
			id: uuid,
			server_id: server.id,
			channel_id: channel.id,
			user_id: user.id,
			content: message,
			timestamp: timestamp
		});
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
			case 'user_updated':
				this.handleUserUpdate(message.user);
				break;
			case 'user_joined_voice':
			case 'user_left_voice':
			case 'voice_signal':
			case 'voice_participants':
			case 'producer_created':
			case 'new_producer':
				import('$lib/stores/voiceStore').then(({ voiceStore }) => {
					voiceStore.handleSignal(message);
				});
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
			default:
				console.warn('Unknown message type:', message.type);
		}
	}
}

export const socketState = new SocketState();
