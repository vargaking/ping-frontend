import { describe, expect, it } from 'vitest';
import type { CallMeta } from '$lib/types/call.types';
import type { MessageType } from '$lib/types/messages.types';
import { buildRenderItems } from './messageItems';

const call: CallMeta = {
	id: 1,
	state: 'ended',
	reason: 'hangup',
	started_at: '2026-10-12T12:00:00Z',
	answered_at: '2026-10-12T12:00:05Z',
	ended_at: '2026-10-12T12:04:00Z',
	duration_s: 235
};

function msg(id: string, seconds: number, overrides: Partial<MessageType> = {}): MessageType {
	return {
		id,
		user_id: 1,
		content: { type: 'doc', content: [] },
		timestamp: new Date(Date.UTC(2026, 9, 12, 12, 0, seconds)).toISOString(),
		...overrides
	};
}

const kinds = (items: ReturnType<typeof buildRenderItems>) => items.map((item) => item.kind);

describe('buildRenderItems', () => {
	it('groups one author’s messages sent close together', () => {
		const items = buildRenderItems([msg('a', 0), msg('b', 10)], null);
		expect(kinds(items)).toEqual(['date', 'group']);
		expect(items[1]).toMatchObject({ messages: [{ id: 'a' }, { id: 'b' }] });
	});

	it.each([
		{
			name: 'between two messages by the same author',
			messages: [msg('a', 0), msg('c', 10, { call }), msg('b', 20)],
			expected: ['date', 'group', 'call', 'group']
		},
		{
			name: 'right after the caller’s own message',
			messages: [msg('a', 0), msg('c', 10, { call })],
			expected: ['date', 'group', 'call']
		},
		{
			name: 'before a message by the same author',
			messages: [msg('c', 0, { call }), msg('b', 10)],
			expected: ['date', 'call', 'group']
		},
		{
			name: 'next to another call row',
			messages: [msg('c1', 0, { call }), msg('c2', 10, { call: { ...call, id: 2 } })],
			expected: ['date', 'call', 'call']
		}
	])('puts a call row $name in its own item', ({ messages, expected }) => {
		const items = buildRenderItems(messages, null);
		expect(kinds(items)).toEqual(expected);
		for (const item of items) {
			if (item.kind === 'group') expect(item.messages.some((m) => m.call)).toBe(false);
		}
	});

	it('keeps the call row’s message so the row can show it', () => {
		const row = msg('c', 0, { call });
		expect(buildRenderItems([row], null)[1]).toEqual({ kind: 'call', key: 'c-c', message: row });
	});

	it('puts the unread divider before a call row it is anchored to', () => {
		const items = buildRenderItems([msg('a', 0), msg('c', 10, { call })], 'c');
		expect(kinds(items)).toEqual(['date', 'group', 'unread', 'call']);
	});
});
