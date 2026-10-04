import { describe, expect, it } from 'vitest';
import type { MessageType } from '$lib/types/messages.types';
import { authorKey, continuesGroup } from './messageGroups';

const SYSTEM_ID = 1;

function msg(overrides: Partial<MessageType> = {}): MessageType {
	return {
		id: 'm',
		user_id: SYSTEM_ID,
		content: { type: 'doc', content: [] },
		timestamp: '2026-01-01T12:00:00Z',
		...overrides
	};
}

const alice = { id: 'a', name: 'Alice' };
const bob = { id: 'b', name: 'Bob' };

describe('continuesGroup', () => {
	it('splits two different imported authors written back to back', () => {
		const first = msg({ imported_author: alice });
		const second = msg({ imported_author: bob, timestamp: '2026-01-01T12:00:10Z' });
		expect(continuesGroup(first, second)).toBe(false);
	});

	it('keeps one imported author together', () => {
		const first = msg({ imported_author: alice });
		const second = msg({ imported_author: alice, timestamp: '2026-01-01T12:00:10Z' });
		expect(continuesGroup(first, second)).toBe(true);
	});

	it('does not merge an imported message with a real one from the owner account', () => {
		const imported = msg({ imported_author: alice });
		const real = msg({ timestamp: '2026-01-01T12:00:10Z' });
		expect(continuesGroup(imported, real)).toBe(false);
		expect(continuesGroup(real, imported)).toBe(false);
	});

	it('groups real users by user id', () => {
		const first = msg({ user_id: 5, imported_author: null });
		expect(continuesGroup(first, msg({ user_id: 5, timestamp: '2026-01-01T12:00:10Z' }))).toBe(
			true
		);
		expect(continuesGroup(first, msg({ user_id: 6, timestamp: '2026-01-01T12:00:10Z' }))).toBe(
			false
		);
	});

	it('starts a new group after the gap or on a reply', () => {
		const first = msg({ user_id: 5 });
		expect(continuesGroup(first, msg({ user_id: 5, timestamp: '2026-01-01T12:06:00Z' }))).toBe(
			false
		);
		const reply = msg({
			user_id: 5,
			timestamp: '2026-01-01T12:00:10Z',
			reply_to: { id: 'x', user_id: 2, preview: 'hi' }
		});
		expect(continuesGroup(first, reply)).toBe(false);
	});
});

describe('authorKey', () => {
	it('differs between an imported author and the owner account', () => {
		expect(authorKey(msg({ imported_author: alice }))).not.toBe(authorKey(msg()));
	});
});
