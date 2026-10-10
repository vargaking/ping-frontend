import { beforeEach, describe, expect, it } from 'vitest';
import type { MessageType } from '$lib/types/messages.types';
import { messagesState } from './messagesState.svelte';

const KEY = '9001';

const msg = (id: string, overrides: Partial<MessageType> = {}): MessageType => ({
	id,
	user_id: 2,
	channel_id: 9001,
	server_id: 1,
	content: { type: 'doc', content: [] },
	timestamp: '2026-10-08T12:00:00Z',
	...overrides
});

const ids = () => messagesState.messages(KEY).map((m) => m.id);

beforeEach(() => {
	messagesState.clearAll();
	messagesState.set(KEY, [msg('a'), msg('b')], true);
});

describe('newer messages exist', () => {
	it('is off by default and for unknown threads', () => {
		expect(messagesState.newerExists(KEY)).toBe(false);
		expect(messagesState.newerExists('nothing')).toBe(false);
	});

	it('keeps server messages out of the window but appends our unsent ones', () => {
		messagesState.markNewerExists(KEY);
		messagesState.addMessage(msg('live'));
		messagesState.addMessage(msg('mine', { status: 'pending' }));
		expect(messagesState.newerExists(KEY)).toBe(true);
		expect(ids()).toEqual(['a', 'b', 'mine']);
	});

	it('does not invent a thread', () => {
		messagesState.markNewerExists('nothing');
		expect(messagesState.has('nothing')).toBe(false);
	});

	it('is cleared by loading or replacing the window', () => {
		messagesState.markNewerExists(KEY);
		messagesState.set(KEY, [msg('c')], false);
		expect(messagesState.newerExists(KEY)).toBe(false);

		messagesState.markNewerExists(KEY);
		messagesState.replace(KEY, [msg('d')], false);
		expect(messagesState.newerExists(KEY)).toBe(false);
	});

	it('survives loading older history', () => {
		messagesState.markNewerExists(KEY);
		messagesState.prependOlder(KEY, [msg('z')], false);
		expect(messagesState.newerExists(KEY)).toBe(true);
		expect(ids()).toEqual(['z', 'a', 'b']);
	});

	it('is cleared with the thread', () => {
		messagesState.markNewerExists(KEY);
		messagesState.clear(KEY);
		expect(messagesState.newerExists(KEY)).toBe(false);
	});
});
