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

describe('loading the newest page past a gap', () => {
	beforeEach(() => {
		messagesState.markNewerExists(KEY);
		messagesState.beginNewestLoad(KEY);
	});

	it('keeps what arrives meanwhile after the page, once', () => {
		messagesState.addMessage(msg('during-1'));
		messagesState.addMessage(msg('during-2'));
		messagesState.addMessage(msg('during-1'));
		expect(ids(), 'live messages still wait out of the old window').toEqual(['a', 'b']);

		messagesState.set(KEY, [msg('x'), msg('y'), msg('during-1')], true);
		expect(ids()).toEqual(['x', 'y', 'during-1', 'during-2']);
		expect(messagesState.newerExists(KEY)).toBe(false);
	});

	it('keeps our own message that was acked while the page loaded', () => {
		messagesState.addMessage(msg('mine', { status: 'pending' }));
		messagesState.updateMessage('mine', { status: undefined });
		messagesState.addMessage(msg('during'));

		messagesState.set(KEY, [msg('x'), msg('y')], true);
		expect(ids()).toEqual(['x', 'y', 'mine', 'during']);
	});

	it('orders what arrived and our acked message by time, not by where it was held', () => {
		messagesState.addMessage(msg('theirs', { timestamp: '2026-10-08T12:01:00Z' }));
		messagesState.addMessage(msg('mine', { timestamp: '2026-10-08T12:02:00Z', status: 'pending' }));
		messagesState.updateMessage('mine', { status: undefined });

		messagesState.set(KEY, [msg('x')], false);
		expect(ids()).toEqual(['x', 'theirs', 'mine']);
	});

	it('keeps our unsent messages last', () => {
		messagesState.addMessage(msg('mine', { status: 'pending' }));
		messagesState.addMessage(msg('during'));

		messagesState.set(KEY, [msg('x')], false);
		expect(ids()).toEqual(['x', 'during', 'mine']);
	});

	it('applies edits and deletes to what is waiting', () => {
		messagesState.addMessage(msg('edited'));
		messagesState.addMessage(msg('removed'));
		messagesState.updateMessage('edited', { edited_at: '2026-10-08T12:05:00Z' });
		messagesState.removeMessage('removed');

		messagesState.set(KEY, [msg('x')], false);
		expect(ids()).toEqual(['x', 'edited']);
		expect(messagesState.messages(KEY)[1].edited_at).toBe('2026-10-08T12:05:00Z');
	});

	it('stops waiting once the load ends without a page', () => {
		messagesState.endNewestLoad(KEY);
		messagesState.addMessage(msg('late'));
		messagesState.set(KEY, [msg('x')], false);
		expect(ids()).toEqual(['x']);
	});
});

describe('a window of history', () => {
	const window = () => {
		messagesState.setWindow(KEY, [msg('w1'), msg('w2')], true);
	};

	it('replaces the list, keeps our unsent messages and waits for the present', () => {
		messagesState.addMessage(msg('mine', { status: 'pending' }));

		window();

		expect(ids()).toEqual(['w1', 'w2', 'mine']);
		expect(messagesState.hasMore(KEY)).toBe(true);
		expect(messagesState.newerExists(KEY)).toBe(true);
		expect(messagesState.heldBack(KEY)).toEqual([]);
	});

	it('holds back live messages from others and lists them once', () => {
		window();

		messagesState.addMessage(msg('live', { user_id: 3 }));
		messagesState.addMessage(msg('live', { user_id: 3 }));

		expect(ids()).toEqual(['w1', 'w2']);
		expect(messagesState.heldBack(KEY)).toEqual([{ id: 'live', user_id: 3 }]);
	});

	it('drops a held-back message that was deleted', () => {
		window();
		messagesState.addMessage(msg('live'));

		messagesState.removeMessage('live');

		expect(messagesState.heldBack(KEY)).toEqual([]);
	});

	it.each([
		['stays counted', ['elsewhere'], ['live-1', 'live-2']],
		['is dropped once the new window shows it', ['live-1'], ['live-2']]
	])('a message held back %s when another window opens', (_name, shown, expected) => {
		window();
		messagesState.addMessage(msg('live-1', { user_id: 3 }));
		messagesState.addMessage(msg('live-2', { user_id: 4 }));

		messagesState.setWindow(KEY, [msg('x'), ...shown.map((id) => msg(id))], true);

		expect(messagesState.heldBack(KEY).map((m) => m.id)).toEqual(expected);
	});

	it('counts the unseen messages of a live thread that the window leaves out', () => {
		messagesState.setWindow(KEY, [msg('x'), msg('u1')], true, [
			msg('u1', { user_id: 3 }),
			msg('u2', { user_id: 4 })
		]);

		expect(messagesState.heldBack(KEY)).toEqual([{ id: 'u2', user_id: 4 }]);
	});

	describe('continuing from the server edge', () => {
		it.each([
			['a window', () => window(), 'w2'],
			['a live thread that went stale', () => messagesState.markNewerExists(KEY), 'b']
		])('starts at the newest server message of %s, not at our own', (_name, detach, edge) => {
			messagesState.addMessage(msg('mine', { status: 'pending' }));
			detach();
			messagesState.addMessage(msg('mine2', { status: 'pending' }));

			messagesState.updateMessage('mine', { status: undefined });
			messagesState.updateMessage('mine2', { status: undefined });

			expect(messagesState.newerAnchor(KEY)).toBe(edge);
		});

		it('has no anchor while the thread is live', () => {
			expect(messagesState.newerAnchor(KEY)).toBeNull();
		});

		it('moves with each newer page and keeps an acked message of ours in order once its page arrives', () => {
			window();
			messagesState.addMessage(msg('mine', { status: 'pending' }));
			messagesState.updateMessage('mine', { status: undefined });

			messagesState.appendNewer(KEY, [msg('n1')], true);
			expect(ids()).toEqual(['w1', 'w2', 'n1', 'mine']);
			expect(messagesState.newerAnchor(KEY)).toBe('n1');

			messagesState.appendNewer(KEY, [msg('mine'), msg('n2')], true);
			expect(ids()).toEqual(['w1', 'w2', 'n1', 'mine', 'n2']);
			expect(messagesState.newerAnchor(KEY)).toBe('n2');

			messagesState.appendNewer(KEY, [msg('n3')], false);
			expect(ids()).toEqual(['w1', 'w2', 'n1', 'mine', 'n2', 'n3']);
			expect(messagesState.newerAnchor(KEY)).toBeNull();
		});
	});

	it('has nothing held back for unknown threads', () => {
		expect(messagesState.heldBack('nothing')).toEqual([]);
	});

	it('applies edits, reactions and deletes to its messages', () => {
		window();

		messagesState.updateMessage('w1', { edited_at: '2026-10-08T12:05:00Z' });
		messagesState.applyReaction('w2', '👍', 5, true);
		messagesState.removeMessage('w1');

		expect(ids()).toEqual(['w2']);
		expect(messagesState.messages(KEY)[0].reactions).toEqual([{ emoji: '👍', user_ids: [5] }]);
	});

	it('stays detached while newer pages arrive, and goes live with the last one', () => {
		window();
		messagesState.addMessage(msg('live'));

		expect(messagesState.appendNewer(KEY, [msg('n1'), msg('n2')], true)).toBe(2);
		expect(ids()).toEqual(['w1', 'w2', 'n1', 'n2']);
		expect(messagesState.newerExists(KEY)).toBe(true);
		expect(messagesState.heldBack(KEY)).toHaveLength(1);

		expect(messagesState.appendNewer(KEY, [msg('n3'), msg('live')], false)).toBe(2);
		expect(ids()).toEqual(['w1', 'w2', 'n1', 'n2', 'n3', 'live']);
		expect(messagesState.newerExists(KEY)).toBe(false);
		expect(messagesState.heldBack(KEY)).toEqual([]);

		messagesState.addMessage(msg('after'));
		expect(ids().at(-1)).toBe('after');
	});

	it('keeps what arrived while the last newer page loaded', () => {
		window();
		messagesState.beginNewestLoad(KEY);
		messagesState.addMessage(msg('during'));

		messagesState.appendNewer(KEY, [msg('n1')], false);

		expect(ids()).toEqual(['w1', 'w2', 'n1', 'during']);
	});

	it('adds nothing to a thread that is already live', () => {
		expect(messagesState.appendNewer(KEY, [msg('n1')], false)).toBe(0);
		expect(ids()).toEqual(['a', 'b']);
	});
});
