import { PUBLIC_WS_URL } from '$env/static/public';
import { get, writable } from 'svelte/store';
import { MessageStore } from './messageStore';
import {
	CurrentChannelIdStore,
	CurrentChannelStore,
	CurrentServerIdStore,
	CurrentServerStore,
	UserStore
} from './userStore';
import { db } from '$lib/utils/db';
import { v4 as uuidv4 } from 'uuid';

class SocketManager {
	private socket: WebSocket | null = null;
	private isConnecting: boolean = false;

	connect() {
		if (this.socket) {
			return;
		}

		this.socket = new WebSocket(PUBLIC_WS_URL);

		this.socket.onopen = () => {
			console.log('WebSocket connection established');
			this.sendInit();

			UserStore.subscribe(() => {
				this.sendInit();
			});
		};

		this.socket.onclose = () => {
			console.log('WebSocket connection closed');

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

			setTimeout(() => {
				this.connect();
			}, 2000);
		}
	}

	sendInit() {
		const user = get(UserStore);

		console.debug('SocketManager sendInit called with user:', user);

		if (!user || !user.id) return;

		console.debug('Sending connection_init for user:', user);

		this.socket?.send(JSON.stringify({ type: 'connection_init', user_id: user.id }));
	}

	async sendMessage(message: string) {
		if (!message) return;
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			console.warn('WebSocket is not connected. Message not sent:', message);
			return;
		}

		const user = get(UserStore);
		const server = get(CurrentServerIdStore);
		const channel = get(CurrentChannelIdStore);

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

		const uuid = uuidv4();
		const timestamp = new Date().toISOString();

		this.socket?.send(
			JSON.stringify({
				type: 'message',
				id: uuid,
				server_id: server,
				channel_id: channel,
				user_id: user.id,
				content: message,
				timestamp: timestamp
			})
		);

		MessageStore.update((messages) => {
			messages.push({
				id: uuid,
				server_id: server,
				channel_id: channel,
				user_id: user.id,
				content: message,
				timestamp: timestamp
			});
			return messages;
		});

		await db.messages.add({
			id: uuid,
			server_id: server,
			channel_id: channel,
			user_id: user.id,
			content: message,
			timestamp: timestamp
		});
	}

	async handleIncomingMessage(message: any) {
		if (
			message.server_id == get(CurrentServerIdStore) &&
			message.channel_id == get(CurrentChannelIdStore)
		) {
			MessageStore.update((messages) => {
				messages.push(message);
				return messages;
			});
		}

		await db.messages.add(message);

		// Save timestamp to localstorage for message sync
		localStorage.setItem(`last_updated`, message.timestamp);
	}

	commSwitch(message: any) {
		if (!message || !message.type) {
			console.warn('Invalid message format:', message);
			return;
		}

		switch (message.type) {
			case 'message':
				// Handle incoming message
				this.handleIncomingMessage(message);
				break;
			// Add more cases as needed
			default:
				console.warn('Unknown message type:', message.type);
		}
	}
}
export const SocketStore = writable<SocketManager>(new SocketManager());
