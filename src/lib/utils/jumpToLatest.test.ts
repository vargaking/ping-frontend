import { describe, expect, it } from 'vitest';
import type { MessageType } from '$lib/types/messages.types';
import {
	countNewBelow,
	escapeJumpsToLatest,
	isAtBottom,
	isFarFromBottom,
	jumpBehavior,
	jumpLabel,
	showJumpButton
} from './jumpToLatest';

const metrics = (distance: number, clientHeight = 500) => ({
	clientHeight,
	scrollHeight: 10_000,
	scrollTop: 10_000 - clientHeight - distance
});

describe('isAtBottom', () => {
	it('is true within 80 px of the bottom and false from 80 px', () => {
		expect(isAtBottom(metrics(0))).toBe(true);
		expect(isAtBottom(metrics(79))).toBe(true);
		expect(isAtBottom(metrics(80))).toBe(false);
	});
});

describe('isFarFromBottom', () => {
	it('is true only beyond one screen', () => {
		expect(isFarFromBottom(metrics(500))).toBe(false);
		expect(isFarFromBottom(metrics(501))).toBe(true);
	});
});

describe('jumpBehavior', () => {
	it('scrolls smoothly up to three screens and lands at once beyond', () => {
		expect(jumpBehavior(metrics(500), false)).toBe('smooth');
		expect(jumpBehavior(metrics(1500), false)).toBe('smooth');
		expect(jumpBehavior(metrics(1501), false)).toBe('instant');
	});

	it('never animates with reduced motion', () => {
		expect(jumpBehavior(metrics(600), true)).toBe('instant');
	});
});

describe('showJumpButton', () => {
	const hidden = { newerExists: false, atBottom: true, far: false, newCount: 0 };

	it('is hidden at the bottom', () => {
		expect(showJumpButton(hidden)).toBe(false);
		expect(showJumpButton({ ...hidden, far: true })).toBe(false);
	});

	it('shows when scrolled up more than a screen', () => {
		expect(showJumpButton({ ...hidden, atBottom: false, far: true })).toBe(true);
	});

	it('shows closer than a screen only when messages arrived', () => {
		expect(showJumpButton({ ...hidden, atBottom: false })).toBe(false);
		expect(showJumpButton({ ...hidden, atBottom: false, newCount: 2 })).toBe(true);
	});

	it('always shows while newer messages exist', () => {
		expect(showJumpButton({ ...hidden, newerExists: true })).toBe(true);
	});
});

describe('jumpLabel', () => {
	it('names the count', () => {
		expect(jumpLabel(0)).toBe('Jump to latest');
		expect(jumpLabel(1)).toBe('Jump to latest, 1 new message');
		expect(jumpLabel(3)).toBe('Jump to latest, 3 new messages');
	});
});

describe('countNewBelow', () => {
	const ME = 1;
	const msg = (id: string, minute: number, overrides: Partial<MessageType> = {}): MessageType => ({
		id,
		user_id: 2,
		content: { type: 'doc', content: [] },
		timestamp: `2026-10-08T12:${String(minute).padStart(2, '0')}:00Z`,
		...overrides
	});
	const seenAt = (m: MessageType) => ({ id: m.id, timestamp: m.timestamp });

	it('counts messages from others after the marker', () => {
		const messages = [msg('a', 0), msg('b', 1), msg('c', 2), msg('d', 3)];
		expect(countNewBelow(messages, seenAt(messages[1]), ME)).toBe(2);
	});

	it('skips own and unsent messages', () => {
		const messages = [
			msg('a', 0),
			msg('b', 1, { user_id: ME }),
			msg('c', 2, { user_id: ME, status: 'pending' }),
			msg('d', 3, { status: 'failed' }),
			msg('e', 4)
		];
		expect(countNewBelow(messages, seenAt(messages[0]), ME)).toBe(1);
	});

	it('counts nothing without a marker', () => {
		expect(countNewBelow([msg('a', 0)], null, ME)).toBe(0);
	});

	it('falls back to timestamps when the marker message is gone', () => {
		const gone = msg('b', 1);
		const messages = [msg('a', 0), msg('c', 2), msg('d', 3)];
		expect(countNewBelow(messages, seenAt(gone), ME)).toBe(2);
	});

	it('drops a counted message that was deleted', () => {
		const messages = [msg('a', 0), msg('b', 1), msg('c', 2)];
		const seen = seenAt(messages[0]);
		expect(countNewBelow(messages, seen, ME)).toBe(2);
		expect(countNewBelow([messages[0], messages[2]], seen, ME)).toBe(1);
	});

	it('does not count older history prepended above the marker', () => {
		const messages = [msg('a', 0), msg('b', 1)];
		const seen = seenAt(messages[1]);
		expect(countNewBelow([msg('x', 0), msg('y', 0), ...messages], seen, ME)).toBe(0);
	});
});

describe('escapeJumpsToLatest', () => {
	const escape = {
		key: 'Escape',
		defaultPrevented: false,
		isComposing: false,
		repeat: false,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false
	};
	const free = { desktop: true, buttonShown: true, escapeTaken: false };

	it('jumps on a plain Escape when nothing else wants it', () => {
		expect(escapeJumpsToLatest(escape, free)).toBe(true);
	});

	it.each([
		['another key', { key: 'a' }],
		['Ctrl', { ctrlKey: true }],
		['Meta', { metaKey: true }],
		['Alt', { altKey: true }],
		['Shift', { shiftKey: true }],
		['composition', { isComposing: true }],
		['key repeat', { repeat: true }],
		['a handled event', { defaultPrevented: true }]
	])('ignores %s', (_, change) => {
		expect(escapeJumpsToLatest({ ...escape, ...change }, free)).toBe(false);
	});

	it.each([
		['a phone', { desktop: false }],
		['a hidden button', { buttonShown: false }],
		['Escape in use elsewhere', { escapeTaken: true }]
	])('ignores %s', (_, change) => {
		expect(escapeJumpsToLatest(escape, { ...free, ...change })).toBe(false);
	});
});
