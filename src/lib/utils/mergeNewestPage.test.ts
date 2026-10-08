import { describe, expect, it } from 'vitest';
import type { MessageType } from '$lib/types/messages.types';
import { mergeNewestPage, replaceWithNewestPage } from './mergeNewestPage';

function msg(id: string, overrides: Partial<MessageType> = {}): MessageType {
	return {
		id,
		user_id: 1,
		content: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: id }] }]
		},
		timestamp: '2026-10-08T12:00:00Z',
		...overrides
	};
}

const ids = (messages: MessageType[]) => messages.map((m) => m.id);
const known = (messages: MessageType[]) => new Set(ids(messages));

describe('mergeNewestPage', () => {
	it('keeps older pages, appends what arrived and drops what was deleted in range', () => {
		const loaded = ['a', 'b', 'c', 'd', 'e'].map((id) => msg(id));
		const page = [msg('c'), msg('e'), msg('f'), msg('g')];

		const merged = mergeNewestPage(loaded, page, { complete: false, knownBefore: known(loaded) });

		expect(ids(merged!.messages)).toEqual(['a', 'b', 'c', 'e', 'f', 'g']);
		expect(merged!.keptOlder).toBe(true);
	});

	it('takes the fetched version of a message in range', () => {
		const loaded = [msg('a'), msg('b'), msg('c')];
		const edited = msg('c', { edited_at: '2026-10-08T12:05:00Z' });

		const merged = mergeNewestPage(loaded, [msg('b'), edited], {
			complete: false,
			knownBefore: known(loaded)
		});

		expect(merged!.messages[2]).toBe(edited);
	});

	it('keeps unsent messages last and never duplicates one the server already has', () => {
		const loaded = [
			msg('a'),
			msg('b'),
			msg('p1', { status: 'pending' }),
			msg('p2', { status: 'failed' })
		];
		const page = [msg('a'), msg('b'), msg('p1')];

		const merged = mergeNewestPage(loaded, page, { complete: false, knownBefore: known(loaded) });

		expect(ids(merged!.messages)).toEqual(['a', 'b', 'p1', 'p2']);
		expect(merged!.messages[2].status).toBeUndefined();
		expect(merged!.messages[3].status).toBe('failed');
	});

	it('keeps a message that arrived live while the page was in flight', () => {
		const before = [msg('a'), msg('b')];
		const loaded = [...before, msg('live'), msg('p', { status: 'pending' })];

		const merged = mergeNewestPage(loaded, [msg('a'), msg('b'), msg('c')], {
			complete: false,
			knownBefore: known(before)
		});

		expect(ids(merged!.messages)).toEqual(['a', 'b', 'c', 'live', 'p']);
	});

	it('returns null when the page starts after everything loaded', () => {
		const loaded = [msg('a'), msg('b')];

		expect(
			mergeNewestPage(loaded, [msg('x'), msg('y')], { complete: false, knownBefore: known(loaded) })
		).toBeNull();
	});

	it('returns null when the page starts at a message the list is missing', () => {
		const loaded = [msg('a'), msg('c')];

		expect(
			mergeNewestPage(loaded, [msg('b'), msg('c'), msg('d')], {
				complete: false,
				knownBefore: known(loaded)
			})
		).toBeNull();
	});

	it('takes a complete page as the whole thread', () => {
		const loaded = [msg('a'), msg('b'), msg('c'), msg('p', { status: 'pending' })];

		const merged = mergeNewestPage(loaded, [msg('b'), msg('d')], {
			complete: true,
			knownBefore: known(loaded)
		});

		expect(ids(merged!.messages)).toEqual(['b', 'd', 'p']);
		expect(merged!.keptOlder).toBe(false);
	});

	it('leaves only unsent messages when the thread is now empty', () => {
		const loaded = [msg('a'), msg('p', { status: 'pending' })];

		const merged = mergeNewestPage(loaded, [], { complete: true, knownBefore: known(loaded) });

		expect(ids(merged!.messages)).toEqual(['p']);
	});
});

describe('replaceWithNewestPage', () => {
	it('drops older pages and keeps arrivals and unsent messages', () => {
		const before = ['a', 'b', 'c'].map((id) => msg(id));
		const loaded = [...before, msg('live'), msg('p', { status: 'pending' })];

		const replaced = replaceWithNewestPage(loaded, [msg('c'), msg('d')], known(before));

		expect(ids(replaced)).toEqual(['c', 'd', 'live', 'p']);
	});
});
