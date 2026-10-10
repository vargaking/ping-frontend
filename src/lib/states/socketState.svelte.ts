import { PUBLIC_WS_URL } from '$env/static/public';
import type { JSONContent } from '@tiptap/core';
import { usersState } from './usersState.svelte';
import { serversState } from './serversState.svelte';
import { serverRequestState } from './serverRequestState.svelte';
import { voiceState } from './voiceState.svelte';
import { connectionState, serverHost } from './connectionState.svelte';
import {
	messagesState,
	messageThreadKey,
	channelThreadKey,
	directThreadKey,
	postThreadKey,
	threadKey
} from './messagesState.svelte';
import { forumState } from './forumState.svelte';
import { serverImportState } from './serverImportState.svelte';
import { typingState } from './typingState.svelte';
import { conversationsState } from './conversationsState.svelte';
import { unreadState } from './unreadState.svelte';
import { notificationsState } from './notificationsState.svelte';
import { documentFocusState, type ActivityState } from '$lib/utils/documentFocus.svelte';
import { reportActivity } from '$lib/utils/push';
import { voicePresenceState } from './voicePresenceState.svelte';
import { overwritesState } from './overwritesState.svelte';
import { playMentionChime, playMessageBlip } from '$lib/utils/notificationSound';
import { notifyChannelMessage, showThreadNotification } from '$lib/utils/desktopNotification';
import { channelTag, dmTag } from '$lib/utils/notificationTags';
import { postPath } from '$lib/utils/channelRoutes';
import { messageMentionsUser, messagePreviewText } from '$lib/utils/messageContent';
import { db } from '$lib/utils/db';
import { incomingMessageEffects } from '$lib/utils/incomingMessage';
import { channelRemoved } from '$lib/utils/channelRemoved';
import { serverRemoved } from '$lib/utils/serverRemoved';
import { getUser } from '$lib/requests/users/getUser';
import { v4 as uuidv4 } from 'uuid';
import type { Embed, MessageTarget, MessageType } from '$lib/types/messages.types';
import type { User } from '$lib/types/auth.types';
import type { Attachment } from '$lib/types/attachment.types';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import type { Server } from '$lib/types/server.types';
import type { ServerRequest } from '$lib/types/serverRequest.types';
import type {
	ServerImportFinishedFrame,
	ServerImportUpdatedFrame
} from '$lib/types/serverImport.types';
import { applyReaction } from '$lib/utils/reactions';
import { markRepliesDeleted, refreshReplyQuotes, replyRefFor } from '$lib/utils/replies';
import { replyState } from './replyState.svelte';
import { Outbox } from './outboxState.svelte';
import { HIDDEN_RESYNC_MS, resyncState } from './resyncState.svelte';
import { updateState } from './updateState.svelte';

/** Server close code for "no valid session" (see /ws in ping-server). */
const WS_CLOSE_UNAUTHENTICATED = 4401;
const RECONNECT_DELAYS_MS = [2000, 4000, 8000, 10000];
const PING_INTERVAL_MS = 10_000;
const PONG_TIMEOUT_MS = 5_000;
const RESUME_PONG_TIMEOUT_MS = 3_000;
const MAX_MISSED_PONGS = 2;
const TYPING_SEND_INTERVAL_MS = 3000;

class SocketState {
	private socket: WebSocket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	connected: boolean = $state(false);
	/** The connection dropped and a reconnect is pending. */
	reconnecting: boolean = $state(false);
	private hasConnected = false;
	private activitySubscribed = false;
	private listenersAttached = false;
	private hiddenAt: number | null = null;
	private reconnectAttempt = 0;
	private outageLogged = false;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private pongTimer: ReturnType<typeof setTimeout> | null = null;
	private outstandingPing: number | null = null;
	private missedPongs = 0;
	/** The server answered a ping with invalid_frame: it predates the heartbeat. */
	private heartbeatUnsupported = false;
	private lastTypingSent = new Map<string, number>();
	private outbox = new Outbox({
		// A socket can still report OPEN for a while after the network is gone.
		ready: () => this.socket?.readyState === WebSocket.OPEN && navigator.onLine,
		send: (frame) => this.socket?.send(JSON.stringify(frame))
	});

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

		if (!this.listenersAttached) {
			this.listenersAttached = true;
			document.addEventListener('visibilitychange', () => {
				if (document.hidden) {
					this.hiddenAt = Date.now();
					return;
				}
				this.checkAfterResume();
				void updateState.check();
				// Frames sent while the page was frozen can be lost even if the socket survived.
				const hiddenFor = this.hiddenAt == null ? 0 : Date.now() - this.hiddenAt;
				this.hiddenAt = null;
				if (hiddenFor >= HIDDEN_RESYNC_MS) void resyncState.request('resume');
			});
			window.addEventListener('pageshow', (event) => {
				if (!event.persisted) return;
				this.checkAfterResume();
				void updateState.check();
				void resyncState.request('resume');
			});
			window.addEventListener('online', () => {
				this.retryNow();
				this.outbox.flush();
			});
		}

		connectionState.setStatus(serverHost, this.reconnecting ? 'reconnecting' : 'connecting');

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = window.location.host;
		const wsUrl = PUBLIC_WS_URL.startsWith('/')
			? `${protocol}//${host}${PUBLIC_WS_URL}`
			: PUBLIC_WS_URL;

		const socket = new WebSocket(wsUrl);
		this.socket = socket;

		socket.onopen = () => {
			if (this.outageLogged) console.info('WebSocket recovered');
			this.outageLogged = false;
			this.reconnectAttempt = 0;
			this.connected = true;
			this.reconnecting = false;
			connectionState.setStatus(serverHost, 'connected');
			this.startHeartbeat();
			void connectionState.checkIdentity();

			// Voice frames sent while we were offline are gone, so refetch.
			const serverId = serversState.selectedServerId;
			if (this.hasConnected && serverId != null) voicePresenceState.load(serverId);
			if (this.hasConnected) {
				forumState.markStale();
				void resyncState.request('reconnect');
				void updateState.check();
			}
			this.hasConnected = true;

			this.sendActivity(documentFocusState.active ? 'active' : 'idle');
			this.outbox.flush();
		};

		socket.onclose = (event) => {
			// A close event from a socket we already replaced or dropped on
			// purpose (see disconnect()) must not touch the current state.
			if (this.socket !== socket) return;

			this.socket = null;
			this.connected = false;
			this.stopHeartbeat();
			typingState.clearAll();
			this.outbox.connectionLost();

			if (event.code === WS_CLOSE_UNAUTHENTICATED) {
				connectionState.setStatus(serverHost, 'disconnected');
				// Session is gone or expired. Retrying would loop forever, so
				// hand over to the login page instead.
				usersState.setLoggedInUser(null);
				if (window.location.pathname.startsWith('/app')) {
					window.location.href = '/login/';
				}
				return;
			}

			this.scheduleReconnect();
		};

		socket.onmessage = (event) => {
			const data = JSON.parse(event.data);
			connectionState.noteFrame(serverHost);
			this.commSwitch(data);
		};
	}

	private scheduleReconnect() {
		if (!this.outageLogged) console.info('WebSocket lost, reconnecting');
		this.outageLogged = true;
		this.reconnecting = true;
		connectionState.setStatus(serverHost, 'reconnecting');
		const delay =
			RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
		this.reconnectAttempt++;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	private retryNow() {
		if (!this.reconnecting || this.socket) return;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
		this.connect();
	}

	/** A phone can freeze the page for a long while and leave a socket that
	 *  still says OPEN, so after coming back it has to answer a ping quickly. */
	private checkAfterResume() {
		if (this.reconnecting) {
			this.retryNow();
			return;
		}
		if (this.socket?.readyState !== WebSocket.OPEN || this.heartbeatUnsupported) return;

		if (this.pongTimer) clearTimeout(this.pongTimer);
		this.pongTimer = null;
		this.outstandingPing = null;
		this.sendPing(true);
	}

	private startHeartbeat() {
		this.stopHeartbeat();
		this.heartbeatUnsupported = false;
		this.pingTimer = setInterval(() => this.sendPing(), PING_INTERVAL_MS);
		this.sendPing();
	}

	private stopHeartbeat() {
		if (this.pingTimer) clearInterval(this.pingTimer);
		if (this.pongTimer) clearTimeout(this.pongTimer);
		this.pingTimer = null;
		this.pongTimer = null;
		this.outstandingPing = null;
		this.missedPongs = 0;
	}

	/** `afterResume` pings are stricter: one missed pong drops the socket and
	 *  the replacement connects at once instead of after the backoff. */
	private sendPing(afterResume = false) {
		if (this.heartbeatUnsupported || this.outstandingPing != null || document.hidden) return;
		if (this.socket?.readyState !== WebSocket.OPEN) return;

		const t = performance.now();
		this.outstandingPing = t;
		this.socket.send(JSON.stringify({ type: 'ping', t }));
		this.pongTimer = setTimeout(
			() => this.pongTimedOut(t, afterResume),
			afterResume ? RESUME_PONG_TIMEOUT_MS : PONG_TIMEOUT_MS
		);
	}

	private pongTimedOut(t: number, afterResume: boolean) {
		if (this.outstandingPing !== t) return;
		this.outstandingPing = null;
		// A background tab's timers are throttled, so a late pong proves nothing.
		if (document.hidden) return;

		this.missedPongs++;
		connectionState.resetRtt(serverHost);
		if (!afterResume && this.missedPongs < MAX_MISSED_PONGS) return;

		const socket = this.socket;
		this.socket = null;
		this.connected = false;
		this.stopHeartbeat();
		socket?.close();
		typingState.clearAll();
		this.outbox.connectionLost();
		this.scheduleReconnect();
		if (afterResume) this.retryNow();
	}

	private handlePong(t: number) {
		if (t !== this.outstandingPing) return;
		connectionState.addRttSample(serverHost, performance.now() - t);
		this.outstandingPing = null;
		this.missedPongs = 0;
		if (this.pongTimer) clearTimeout(this.pongTimer);
		this.pongTimer = null;
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
		this.reconnectAttempt = 0;
		this.outageLogged = false;
		this.stopHeartbeat();
		typingState.clearAll();
		this.outbox.clear();
		connectionState.setStatus(serverHost, 'disconnected');
		socket?.close();
	}

	/** Announce that we're typing, at most once per interval per thread. */
	sendTyping(target: MessageTarget) {
		if (this.socket?.readyState !== WebSocket.OPEN) return;

		const key = threadKey(target);
		const now = Date.now();
		const last = this.lastTypingSent.get(key);
		if (last !== undefined && now - last < TYPING_SEND_INTERVAL_MS) return;
		this.lastTypingSent.set(key, now);

		this.socket.send(
			JSON.stringify(
				target.kind === 'channel'
					? {
							type: 'typing',
							server_id: target.serverId,
							channel_id: target.channelId,
							...(target.postId != null && { post_id: target.postId })
						}
					: { type: 'typing', conversation_id: target.conversationId }
			)
		);
	}

	/**
	 * Queues the message and shows it as pending until the server acks it, so it
	 * goes out whenever the socket is up. Returns false only when there is
	 * nothing to send or nobody logged in.
	 */
	sendMessage(
		target: MessageTarget,
		message: JSONContent,
		attachments: Attachment[] = [],
		replyTo?: MessageType,
		embeds: Embed[] = []
	): boolean {
		if (!message) return false;
		// Callers pass reactive state; IndexedDB can't store Svelte's proxies.
		attachments = $state.snapshot(attachments);
		embeds = $state.snapshot(embeds);
		const user = usersState.loggedInUser;
		if (!user) return false;

		const id = uuidv4();
		const timestamp = new Date().toISOString();
		const attachmentIds = attachments.map((a) => a.id);
		const reply_to = replyTo ? replyRefFor(replyTo) : undefined;

		const local: MessageType =
			target.kind === 'channel'
				? {
						id,
						server_id: target.serverId,
						channel_id: target.channelId,
						post_id: target.postId ?? null,
						user_id: user.id,
						content: message,
						timestamp,
						attachments,
						reply_to,
						embeds
					}
				: {
						id,
						conversation_id: target.conversationId,
						user_id: user.id,
						content: message,
						timestamp,
						attachments,
						reply_to,
						embeds
					};

		const frame =
			target.kind === 'channel'
				? {
						type: 'message',
						id,
						server_id: target.serverId,
						channel_id: target.channelId,
						...(target.postId != null && { post_id: target.postId }),
						content: message,
						timestamp,
						attachment_ids: attachmentIds,
						reply_to: replyTo?.id,
						embeds
					}
				: {
						type: 'direct_message',
						id,
						conversation_id: target.conversationId,
						content: message,
						timestamp,
						attachment_ids: attachmentIds,
						reply_to: replyTo?.id,
						embeds
					};

		// Recipients drop our indicator when the message lands, so the next
		// keystroke should announce again right away.
		this.lastTypingSent.delete(threadKey(target));

		messagesState.addMessage({ ...local, status: 'pending' });
		if (target.kind === 'direct') conversationsState.noteMessage(local, { mine: true });
		else unreadState.noteChannelMessage(target.channelId, target.serverId, id, { mine: true });

		this.outbox.enqueue(local, frame);
		return true;
	}

	retryMessage(id: string) {
		this.outbox.retry(id);
	}

	discardMessage(id: string) {
		this.outbox.discard(id);
	}

	async handleIncomingMessage(message: MessageType) {
		const me = usersState.loggedInUser;
		const mine = me != null && message.user_id === me.id;
		const channelId = message.channel_id;
		const serverId = message.server_id;
		const postId = message.post_id ?? null;

		if (channelId != null) typingState.clear(messageThreadKey(message), message.user_id);

		// A post's thread is only filled once opened; an unopened one fetches its
		// history (including this message) then.
		const isCurrentThread =
			postId != null
				? messagesState.has(postThreadKey(postId))
				: message.server_id == serversState.selectedServerId &&
					message.channel_id == serversState.selectedChannelId;
		if (isCurrentThread) {
			messagesState.addMessage(message);
		}

		// Decided before the IndexedDB write so the list sees the final read state.
		let effects: ReturnType<typeof incomingMessageEffects> | null = null;
		const mentionsMe = !mine && me != null && messageMentionsUser(message.content, me.id);
		if (channelId != null && serverId != null) {
			const key = channelThreadKey(channelId);
			unreadState.noteChannelMessage(channelId, serverId, message.id, { mine, mentionsMe });
			effects = incomingMessageEffects({
				mine,
				active: unreadState.isActive(key),
				reading: unreadState.isReading(key),
				inPost: postId != null
			});
			if (effects.markRead) unreadState.markThreadRead({ kind: 'channel', channelId }, message.id);
		}

		// Sockets now fan out chat frames to every socket of every recipient
		// (minus the sender's own socket), so this can be our own message arriving
		// on another tab — put avoids a ConstraintError from the duplicate id.
		await db.messages.put(message);

		if (!effects?.notify || channelId == null || serverId == null) return;

		this.notifyIncoming({
			kind: 'channel',
			channelId,
			serverId,
			postId,
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

		if (conversationId != null) typingState.clear(directThreadKey(conversationId), message.user_id);

		// Only append to threads already loaded; an unopened one fetches its
		// history (including this message) when opened.
		if (messagesState.has(messageThreadKey(message))) {
			messagesState.addMessage(message);
		}

		let effects: ReturnType<typeof incomingMessageEffects> | null = null;
		conversationsState.noteMessage(message, { mine });
		if (conversationId != null) {
			const key = directThreadKey(conversationId);
			effects = incomingMessageEffects({
				mine,
				active: unreadState.isActive(key),
				reading: unreadState.isReading(key),
				inPost: false
			});
			if (effects.markRead) {
				unreadState.markThreadRead({ kind: 'direct', conversationId }, message.id);
			}
		}

		await db.messages.put(message);

		if (!effects?.notify || conversationId == null) return;

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
					/** Set for a message in a forum post. */
					postId: number | null;
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
				noun: 'messages',
				unread: conversationsState.conversations[args.conversationId]?.unread_count
			});
			return;
		}

		const server = serversState.servers[args.serverId];
		const href =
			args.postId != null
				? postPath(args.serverId, args.channelId, args.postId)
				: `/app/server/${args.serverId}/channel/${args.channelId}/`;
		if (args.mentionsMe) {
			void showThreadNotification({
				tag: channelTag(args.channelId),
				title: `${senderUsername} in #${unreadState.channelName(args.channelId)}`,
				body,
				url: href,
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
			href
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
		await refreshReplyQuotes(message);
	}

	async handleMessageDeleted(message: { id: string }) {
		messagesState.removeMessage(message.id);
		conversationsState.messageDeleted(message.id);
		unreadState.messageDeleted(message.id);
		await db.messages.delete(message.id);
		replyState.cancelFor(message.id);
		await markRepliesDeleted(message.id);
	}

	handleServerAdded(server: Server) {
		serversState.addServer(server);
		if (server.id == null) return;
		serversState
			.fetchServerChannels(server.id)
			.catch((e) => console.warn('Failed to load channels for added server', e));
	}

	handleServerRequestUpdated(request: ServerRequest) {
		serverRequestState.apply(request);
		if (request.status === 'approved' && request.server_id != null) {
			const serverId = request.server_id;
			toast(`Your server “${request.name}” was approved`, {
				action: { label: 'Open', onClick: () => goto(`/app/server/${serverId}/`) }
			});
		} else if (request.status === 'declined') {
			toast('Your server request was declined');
		}
	}

	/** Every member sees what an import added; the owner's tab also shows the outcome. */
	handleServerImportFinished({ server_id }: ServerImportFinishedFrame) {
		serversState
			.fetchServerChannels(server_id)
			.catch((e) => console.warn('Failed to reload channels after an import', e));
		serverImportState.refresh(server_id);
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
		// Our own unanswered read is newer; its response brings the server's marker.
		if (frame.channel_id != null) {
			if (unreadState.readPending(channelThreadKey(frame.channel_id))) return;
			unreadState.applyChannelReadState(frame.channel_id, frame.last_read_message_id);
		} else if (frame.conversation_id != null) {
			if (unreadState.readPending(directThreadKey(frame.conversation_id))) return;
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
					typingState.clearUser(message.user_id);
				}

				console.log('Presence update:', message.user_id, message.online ? 'online' : 'offline');
				break;
			case 'typing':
				typingState.note(
					message.conversation_id != null
						? directThreadKey(message.conversation_id)
						: message.post_id != null
							? postThreadKey(message.post_id)
							: channelThreadKey(message.channel_id),
					message.user_id
				);
				break;
			case 'presence_init':
				usersState.setOnlineUsers(message.user_ids);
				break;
			case 'permissions_init':
				serversState.setPermissions(message.servers, message.channels);
				break;
			case 'permissions_updated':
				serversState.setPermission(message.server_id, message.permissions, message.channels);
				break;
			case 'permission_overwrite_updated':
				overwritesState.applyFrame(message);
				break;
			case 'member_roles_updated':
				serversState.setMemberRoles(message.server_id, message.user_id, message.role_ids);
				break;
			case 'role_created':
				serversState.upsertRole(message.server_id, message.role);
				serversState.setRolePositions(message.server_id, message.positions);
				break;
			case 'role_updated':
				serversState.upsertRole(message.server_id, message.role);
				break;
			case 'role_deleted':
				serversState.removeRole(message.server_id, message.role_id);
				serversState.setRolePositions(message.server_id, message.positions);
				break;
			case 'roles_reordered':
				serversState.setRolePositions(message.server_id, message.positions);
				break;
			case 'channel_created':
				serversState.addChannel(message.server_id, message.channel);
				break;
			case 'channel_updated':
				serversState.updateChannel(message.server_id, message.channel);
				voiceState.renameChannel(message.channel.id, message.channel.name);
				break;
			case 'forum_post_created':
			case 'forum_post_updated':
				forumState.applyPost(message.post);
				break;
			case 'forum_post_deleted':
				forumState.applyPostDeleted(message.channel_id, message.post_id);
				break;
			case 'forum_tags_updated':
				forumState.applyTags(message.channel_id, message.tags);
				break;
			case 'channel_group_created':
				serversState.addGroup(message.server_id, message.group);
				break;
			case 'channel_group_updated':
				serversState.updateGroup(message.server_id, message.group);
				break;
			case 'channel_group_deleted':
				serversState.removeGroup(message.server_id, message.group_id, message.layout);
				break;
			case 'channel_layout_updated':
				serversState.applyLayout(message.server_id, message.layout);
				break;
			case 'channel_deleted':
				channelRemoved(
					message.server_id,
					message.channel_id,
					false,
					message.reason === 'no_access'
				);
				break;
			case 'server_updated':
				serversState.patchServer(message.server.id, {
					name: message.server.name,
					server_profile: message.server.server_profile,
					icon_text: message.server.icon_text ?? null,
					icon_tone: message.server.icon_tone ?? null,
					...(message.server.server_settings && {
						server_settings: message.server.server_settings
					})
				});
				break;
			case 'server_deleted':
				serverRemoved(message.server_id, 'deleted');
				break;
			case 'server_added':
				this.handleServerAdded(message.server);
				break;
			case 'server_import_updated': {
				const frame: ServerImportUpdatedFrame = message;
				serverImportState.applyFrame(frame.server_id, frame.import);
				break;
			}
			case 'server_import_finished':
				this.handleServerImportFinished(message);
				break;
			case 'server_request_updated':
				this.handleServerRequestUpdated(message.request);
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
			case 'pong':
				this.handlePong(message.t);
				break;
			case 'message_ack':
				this.outbox.acknowledge(message.id);
				break;
			case 'error':
				if (
					message.code === 'invalid_frame' &&
					message.ref == null &&
					this.outstandingPing != null
				) {
					this.stopHeartbeat();
					this.heartbeatUnsupported = true;
					break;
				}
				if ((message.code === 'forbidden' || message.code === 'duplicate_id') && message.ref) {
					this.outbox.fail(message.ref);
					break;
				}
				if (message.code === 'invalid_content' && message.ref) {
					this.outbox.fail(message.ref);
					toast.error("Couldn't send that message.");
					break;
				}
				if (message.code === 'invalid_attachments' && message.ref) {
					// Nothing was stored server-side, so drop the optimistic copy.
					this.outbox.drop(message.ref);
					this.handleMessageDeleted({ id: message.ref });
					toast.error("Couldn't send the attachment. Try uploading it again.");
					break;
				}
				if (message.code === 'invalid_reply' && message.ref) {
					this.outbox.drop(message.ref);
					this.handleMessageDeleted({ id: message.ref });
					toast.error("Couldn't send the reply. The original message is no longer there.");
					break;
				}
				if (message.code === 'post_locked' && message.ref) {
					this.outbox.drop(message.ref);
					this.handleMessageDeleted({ id: message.ref });
					toast.error('This post is locked.');
					break;
				}
				if (message.code === 'invalid_post' && message.ref) {
					this.outbox.drop(message.ref);
					this.handleMessageDeleted({ id: message.ref });
					toast.error('This post no longer exists.');
					break;
				}
				console.warn('Server rejected a frame:', message.code, message.ref);
				break;
			default:
				console.warn('Unknown message type:', message.type);
		}
	}
}

export const socketState = new SocketState();
