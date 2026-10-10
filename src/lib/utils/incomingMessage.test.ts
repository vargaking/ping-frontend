import { describe, expect, it } from 'vitest';
import { incomingMessageEffects } from './incomingMessage';

const base = { mine: false, active: false, reading: false, inPost: false };

describe('incomingMessageEffects', () => {
	it('marks a message read when it lands in view, without notifying', () => {
		expect(incomingMessageEffects({ ...base, active: true, reading: true })).toEqual({
			markRead: true,
			notify: false
		});
	});

	it('keeps a message unread but quiet while the thread is open and scrolled up', () => {
		expect(incomingMessageEffects({ ...base, active: true })).toEqual({
			markRead: false,
			notify: false
		});
	});

	it('notifies for a thread that is not on screen', () => {
		expect(incomingMessageEffects(base)).toEqual({ markRead: false, notify: true });
	});

	it('does nothing for our own message from another tab', () => {
		expect(incomingMessageEffects({ ...base, mine: true, active: true, reading: true })).toEqual({
			markRead: false,
			notify: false
		});
		expect(incomingMessageEffects({ ...base, mine: true })).toEqual({
			markRead: false,
			notify: false
		});
	});

	it('leaves a forum post reply to the forum views', () => {
		expect(incomingMessageEffects({ ...base, active: true, reading: true, inPost: true })).toEqual({
			markRead: false,
			notify: false
		});
	});
});
