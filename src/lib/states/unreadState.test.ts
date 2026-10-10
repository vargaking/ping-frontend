import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '$lib/types/conversation.types';

const markChannelRead = vi.hoisted(() => vi.fn());
const markConversationRead = vi.hoisted(() => vi.fn());
vi.mock('$lib/requests/channels/markChannelRead', () => ({ markChannelRead }));
vi.mock('$lib/requests/conversations/markConversationRead', () => ({ markConversationRead }));

import { conversationsState } from './conversationsState.svelte';
import { unreadState } from './unreadState.svelte';

const CHANNEL = { kind: 'channel', channelId: 1 } as const;
const OTHER_CHANNEL = { kind: 'channel', channelId: 2 } as const;
const DIRECT = { kind: 'direct', conversationId: 7 } as const;

function seedChannel(channelId: number, messageId = 'm9') {
	unreadState.noteChannelMessage(channelId, 1, messageId, {});
}

function seedConversation() {
	conversationsState.conversations[7] = {
		id: 7,
		created_at: '2026-10-08T12:00:00Z',
		other_user: { id: 2, username: 'bob' },
		last_message: null,
		last_activity: '2026-10-08T12:00:00Z',
		last_message_id: 'm9',
		last_read_message_id: 'm0',
		unread_count: 4
	} as Conversation;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

const reply = (id: string) => ({ channel_id: 1, server_id: 1, last_read_message_id: id });

beforeEach(() => {
	vi.useFakeTimers();
	markChannelRead.mockReset();
	markConversationRead.mockReset();
	markChannelRead.mockImplementation(async (_: number, id: string) => reply(id));
	markConversationRead.mockImplementation(async (conversationId: number, id: string) => ({
		conversation_id: conversationId,
		last_read_message_id: id
	}));
	unreadState.reset();
	conversationsState.reset();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('markThreadRead', () => {
	it('reads a channel at once and tells the server after 750 ms', async () => {
		seedChannel(1);
		unreadState.markThreadRead(CHANNEL, 'm9');

		expect(unreadState.channelUnread(1)).toBe(false);
		expect(markChannelRead).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(749);
		expect(markChannelRead).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(markChannelRead).toHaveBeenCalledTimes(1);
		expect(markChannelRead).toHaveBeenCalledWith(1, 'm9');
	});

	it('sends the newest id once for marks that come in quick succession', async () => {
		seedChannel(1, 'm3');
		unreadState.markThreadRead(CHANNEL, 'm1');
		await vi.advanceTimersByTimeAsync(300);
		unreadState.markThreadRead(CHANNEL, 'm2');
		await vi.advanceTimersByTimeAsync(300);
		unreadState.markThreadRead(CHANNEL, 'm3');
		await vi.advanceTimersByTimeAsync(149);
		expect(markChannelRead).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(markChannelRead).toHaveBeenCalledTimes(1);
		expect(markChannelRead).toHaveBeenCalledWith(1, 'm3');
	});

	it('reads a direct conversation the same way', async () => {
		seedConversation();
		unreadState.markThreadRead(DIRECT, 'm9');

		expect(conversationsState.conversations[7].unread_count).toBe(0);
		expect(conversationsState.conversations[7].last_read_message_id).toBe('m9');
		await vi.advanceTimersByTimeAsync(750);
		expect(markConversationRead).toHaveBeenCalledTimes(1);
		expect(markConversationRead).toHaveBeenCalledWith(7, 'm9');
	});

	it('sends a second request when a mark comes in while the first is in flight', async () => {
		seedChannel(1, 'm2');
		const first = deferred<ReturnType<typeof reply>>();
		markChannelRead.mockReturnValueOnce(first.promise);

		unreadState.markThreadRead(CHANNEL, 'm1');
		expect(unreadState.readPending('1')).toBe(true);
		await vi.advanceTimersByTimeAsync(750);
		expect(markChannelRead).toHaveBeenCalledTimes(1);
		expect(unreadState.readPending('1')).toBe(true);

		unreadState.markThreadRead(CHANNEL, 'm2');
		await vi.advanceTimersByTimeAsync(750);
		expect(markChannelRead).toHaveBeenCalledTimes(2);
		expect(markChannelRead).toHaveBeenLastCalledWith(1, 'm2');

		first.resolve(reply('m1'));
		await vi.advanceTimersByTimeAsync(0);
		expect(unreadState.readPending('1')).toBe(false);
	});

	it('is not pending for a thread that was never marked', () => {
		expect(unreadState.readPending('1')).toBe(false);
		expect(unreadState.readPending('dm:7')).toBe(false);
	});

	it('adopts a newer marker from the response once nothing is pending', async () => {
		seedChannel(1, 'm9');
		markChannelRead.mockResolvedValueOnce(reply('m9'));
		unreadState.markThreadRead(CHANNEL, 'm1');
		expect(unreadState.channelLastReadId(1)).toBe('m1');

		await vi.advanceTimersByTimeAsync(750);
		expect(unreadState.channelLastReadId(1)).toBe('m9');
		expect(unreadState.channelUnread(1)).toBe(false);
	});

	it('ignores the response marker while a newer mark waits to be sent', async () => {
		seedChannel(1, 'm9');
		const first = deferred<ReturnType<typeof reply>>();
		markChannelRead.mockReturnValueOnce(first.promise);

		unreadState.markThreadRead(CHANNEL, 'm1');
		await vi.advanceTimersByTimeAsync(750);
		unreadState.markThreadRead(CHANNEL, 'm2');

		first.resolve(reply('m1'));
		await vi.advanceTimersByTimeAsync(0);
		expect(unreadState.channelLastReadId(1)).toBe('m2');
	});

	it('warns about a failed request and keeps the thread read here', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		seedChannel(1);
		markChannelRead.mockRejectedValueOnce(new Error('offline'));

		unreadState.markThreadRead(CHANNEL, 'm9');
		await vi.advanceTimersByTimeAsync(750);

		expect(warn).toHaveBeenCalledWith('Failed to persist read state', expect.any(Error));
		expect(unreadState.channelUnread(1)).toBe(false);
		expect(unreadState.readPending('1')).toBe(false);
	});

	it("keeps a thread's request when another thread is marked after it", async () => {
		seedChannel(1);
		seedChannel(2);
		unreadState.markThreadRead(CHANNEL, 'm9');
		await vi.advanceTimersByTimeAsync(400);
		unreadState.markThreadRead(OTHER_CHANNEL, 'm9');
		await vi.advanceTimersByTimeAsync(350);
		expect(markChannelRead).toHaveBeenCalledTimes(1);
		expect(markChannelRead).toHaveBeenCalledWith(1, 'm9');

		await vi.advanceTimersByTimeAsync(400);
		expect(markChannelRead).toHaveBeenCalledTimes(2);
		expect(markChannelRead).toHaveBeenLastCalledWith(2, 'm9');
	});

	it('drops queued requests on reset', async () => {
		seedChannel(1);
		unreadState.markThreadRead(CHANNEL, 'm9');
		unreadState.reset();

		await vi.advanceTimersByTimeAsync(2000);
		expect(markChannelRead).not.toHaveBeenCalled();
		expect(unreadState.readPending('1')).toBe(false);
	});
});

describe('active and reading threads', () => {
	it('are tracked separately', () => {
		unreadState.setActiveThread('1');
		expect(unreadState.isActive('1')).toBe(true);
		expect(unreadState.isReading('1')).toBe(false);

		unreadState.setReadingThread('1');
		expect(unreadState.isReading('1')).toBe(true);

		unreadState.setActiveThread(null);
		expect(unreadState.isActive('1')).toBe(false);
		expect(unreadState.isReading('1')).toBe(true);
	});

	it('are both cleared by reset', () => {
		unreadState.setActiveThread('1');
		unreadState.setReadingThread('1');
		unreadState.reset();
		expect(unreadState.isActive('1')).toBe(false);
		expect(unreadState.isReading('1')).toBe(false);
	});
});
