import type { MessageType } from '$lib/types/messages.types';
import { db } from '$lib/utils/db';
import { messagesState } from './messagesState.svelte';
import { conversationsState } from './conversationsState.svelte';
import { unreadState } from './unreadState.svelte';

export const ACK_TIMEOUT_MS = 10_000;
export const MAX_SEND_ATTEMPTS = 3;
export const GIVE_UP_MS = 60_000;
const EXPIRY_CHECK_MS = 5_000;

type OutgoingFrame = { id: string } & Record<string, unknown>;

type Entry = {
	/** The message as the server will store it, without a status. */
	message: MessageType;
	frame: OutgoingFrame;
	attempts: number;
	firstQueuedAt: number;
	/** Set while the frame is out and waiting for its ack. */
	ackTimer: ReturnType<typeof setTimeout> | null;
};

type Transport = {
	ready: () => boolean;
	send: (frame: OutgoingFrame) => void;
};

/**
 * Our own messages that the server hasn't acknowledged yet. They are resent
 * with the same id until acked (the server dedupes on it), and turn into
 * failed messages the user can retry or delete once we give up.
 */
export class Outbox {
	private queue: Entry[] = [];
	private failed: Record<string, Entry> = {};
	private expiryTimer: ReturnType<typeof setInterval> | null = null;

	constructor(private transport: Transport) {}

	enqueue(message: MessageType, frame: OutgoingFrame) {
		this.queue.push(this.freshEntry(message, frame));
		this.watchExpiry();
		this.flush();
	}

	flush() {
		this.expireStale();
		if (!this.transport.ready()) return;
		for (const entry of this.queue) {
			if (entry.ackTimer == null) this.transmit(entry);
		}
	}

	/** The socket is gone: whatever was in flight needs sending again. */
	connectionLost() {
		for (const entry of this.queue) this.stopWaiting(entry);
	}

	acknowledge(id: string) {
		// A late ack still means the server has a message we had given up on.
		const entry = this.take(id) ?? this.takeFailed(id);
		if (!entry) return;
		messagesState.updateMessage(id, { status: undefined });
		db.messages
			.put(entry.message)
			.catch((err) => console.warn('Could not cache sent message:', err));
	}

	/** The server refused the message for good. */
	fail(id: string) {
		const entry = this.take(id);
		if (entry) this.markFailed(entry);
	}

	/** Forget a message that is being removed locally. */
	drop(id: string) {
		this.take(id);
	}

	retry(id: string) {
		const entry = this.takeFailed(id);
		if (!entry) return;
		messagesState.updateMessage(id, { status: 'pending' });
		this.queue.push(this.freshEntry(entry.message, entry.frame));
		this.watchExpiry();
		this.flush();
	}

	discard(id: string) {
		if (!this.failed[id]) return;
		delete this.failed[id];
		messagesState.removeMessage(id);
		void conversationsState.messageDeleted(id);
		void unreadState.messageDeleted(id);
	}

	clear() {
		for (const entry of this.queue) this.stopWaiting(entry);
		this.queue = [];
		this.failed = {};
		this.unwatchExpiry();
	}

	private freshEntry(message: MessageType, frame: OutgoingFrame): Entry {
		return { message, frame, attempts: 0, firstQueuedAt: Date.now(), ackTimer: null };
	}

	private transmit(entry: Entry) {
		this.transport.send(entry.frame);
		entry.attempts++;
		entry.ackTimer = setTimeout(() => {
			entry.ackTimer = null;
			this.flush();
		}, ACK_TIMEOUT_MS);
	}

	private stopWaiting(entry: Entry) {
		if (entry.ackTimer) clearTimeout(entry.ackTimer);
		entry.ackTimer = null;
	}

	private expireStale() {
		const now = Date.now();
		for (const entry of [...this.queue]) {
			const exhausted = entry.attempts >= MAX_SEND_ATTEMPTS && entry.ackTimer == null;
			if (exhausted || now - entry.firstQueuedAt > GIVE_UP_MS) {
				this.take(entry.message.id);
				this.markFailed(entry);
			}
		}
	}

	private markFailed(entry: Entry) {
		this.failed[entry.message.id] = entry;
		messagesState.updateMessage(entry.message.id, { status: 'failed' });
	}

	private take(id: string): Entry | undefined {
		const i = this.queue.findIndex((e) => e.message.id === id);
		if (i === -1) return undefined;
		const [entry] = this.queue.splice(i, 1);
		this.stopWaiting(entry);
		if (this.queue.length === 0) this.unwatchExpiry();
		return entry;
	}

	private takeFailed(id: string): Entry | undefined {
		const entry = this.failed[id];
		delete this.failed[id];
		return entry;
	}

	// While offline nothing flushes, so a message must still be able to time out.
	private watchExpiry() {
		if (this.expiryTimer) return;
		this.expiryTimer = setInterval(() => this.expireStale(), EXPIRY_CHECK_MS);
	}

	private unwatchExpiry() {
		if (this.expiryTimer) clearInterval(this.expiryTimer);
		this.expiryTimer = null;
	}
}
