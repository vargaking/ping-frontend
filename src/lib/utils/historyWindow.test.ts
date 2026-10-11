import { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import type { MessageType } from '$lib/types/messages.types';
import type { MessagePage, PageQuery } from '$lib/requests/channels/getChannelMessages';
import {
	appendNewerPage,
	fetchOpeningPage,
	JUMP_FAILURE_TOAST,
	jumpFailure,
	withUnsentTail
} from './historyWindow';

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

function responseError(status: number) {
	const error = new AxiosError('failed');
	error.response = { status, data: {} } as AxiosError['response'];
	return error;
}

const at = (second: number) => `2026-10-08T12:00:${String(second).padStart(2, '0')}Z`;
const ids = (messages: MessageType[]) => messages.map((m) => m.id);

describe('withUnsentTail', () => {
	it('puts our unsent messages after the page and leaves everything else behind', () => {
		const loaded = [
			msg('old'),
			msg('sent'),
			msg('p', { status: 'pending' }),
			msg('f', { status: 'failed' })
		];

		expect(ids(withUnsentTail([msg('a'), msg('b')], loaded))).toEqual(['a', 'b', 'p', 'f']);
	});

	it('does not repeat an unsent message the page already has', () => {
		const loaded = [msg('p', { status: 'pending' })];

		expect(ids(withUnsentTail([msg('a'), msg('p')], loaded))).toEqual(['a', 'p']);
	});
});

describe('appendNewerPage', () => {
	it('adds the newer page after the loaded messages and skips ones already loaded', () => {
		const loaded = [msg('a'), msg('b')];

		expect(ids(appendNewerPage(loaded, [msg('b'), msg('c'), msg('d')], [], 'b'))).toEqual([
			'a',
			'b',
			'c',
			'd'
		]);
	});

	it('keeps the loaded copy of a message the page repeats', () => {
		const edited = msg('b', { edited_at: at(5) });

		const result = appendNewerPage([msg('a'), edited], [msg('b'), msg('c')], [], 'b');

		expect(result[1]).toBe(edited);
	});

	it('places arrivals by time after the page, without repeating the page, and unsent messages last', () => {
		const loaded = [
			msg('a', { timestamp: at(1) }),
			msg('p', { status: 'pending', timestamp: at(30) })
		];
		const page = [msg('c', { timestamp: at(3) })];
		const arrived = [
			msg('z', { timestamp: at(9) }),
			msg('c', { timestamp: at(3) }),
			msg('y', { timestamp: at(7) })
		];

		expect(ids(appendNewerPage(loaded, page, arrived, 'a'))).toEqual(['a', 'c', 'y', 'z', 'p']);
	});

	describe('with our message carried past the window and acked since', () => {
		const loaded = () => [
			msg('a', { timestamp: at(1) }),
			msg('b', { timestamp: at(2) }),
			msg('mine', { timestamp: at(5) })
		];

		it.each([
			['the page reaches it', ['c', 'mine', 'd'], ['a', 'b', 'c', 'mine', 'd']],
			['the page stops short of it', ['c', 'd'], ['a', 'b', 'c', 'd', 'mine']]
		])('keeps the order and one copy when %s', (_name, page, expected) => {
			const newer = page.map((id) => msg(id));

			expect(ids(appendNewerPage(loaded(), newer, [], 'b'))).toEqual(expected);
		});
	});
});

describe('fetchOpeningPage', () => {
	const page = (id: string): MessagePage => ({
		messages: [msg(id)],
		next_cursor: null,
		has_more: false
	});

	function pages(around: unknown) {
		return vi.fn(async (query?: PageQuery) => {
			if (query && 'around' in query) {
				if (around instanceof Error) throw around;
				return page('window');
			}
			return page('newest');
		});
	}

	it('asks for the newest page when there is no target', async () => {
		const fetchPage = pages(null);

		expect((await fetchOpeningPage(fetchPage, null)).messages[0].id).toBe('newest');
		expect(fetchPage).toHaveBeenCalledOnce();
	});

	it('opens a window around the target', async () => {
		const fetchPage = pages(null);

		expect((await fetchOpeningPage(fetchPage, 'target')).messages[0].id).toBe('window');
		expect(fetchPage).toHaveBeenCalledWith({ around: 'target' });
	});

	it.each([
		['not found', responseError(404)],
		['malformed', responseError(422)],
		['a server error', responseError(500)]
	])('opens the newest page when the server turns the target down: %s', async (_name, error) => {
		const fetchPage = pages(error);

		expect((await fetchOpeningPage(fetchPage, 'target')).messages[0].id).toBe('newest');
	});

	it('does not fall back when the network fails', async () => {
		const fetchPage = pages(new AxiosError('Network Error'));

		await expect(fetchOpeningPage(fetchPage, 'target')).rejects.toThrow('Network Error');
		expect(fetchPage).toHaveBeenCalledOnce();
	});
});

describe('jumpFailure', () => {
	it.each([
		['a 404', responseError(404), 'gone'],
		['a server error', responseError(500), 'failed'],
		['no response', new AxiosError('Network Error'), 'offline'],
		['anything else', new Error('boom'), 'offline']
	])('classifies %s', (_name, error, expected) => {
		expect(jumpFailure(error)).toBe(expected);
		expect(JUMP_FAILURE_TOAST[jumpFailure(error)]).toBeTruthy();
	});
});
