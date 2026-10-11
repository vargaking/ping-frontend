import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import type { MessageType } from '$lib/types/messages.types';
import {
	appendNewerPage,
	JUMP_FAILURE_TOAST,
	jumpFailure,
	newerAnchor,
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

		expect(ids(appendNewerPage(loaded, [msg('b'), msg('c'), msg('d')], []))).toEqual([
			'a',
			'b',
			'c',
			'd'
		]);
	});

	it('keeps the loaded copy of a message the page repeats', () => {
		const edited = msg('b', { edited_at: at(5) });

		const result = appendNewerPage([msg('a'), edited], [msg('b'), msg('c')], []);

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

		expect(ids(appendNewerPage(loaded, page, arrived))).toEqual(['a', 'c', 'y', 'z', 'p']);
	});
});

describe('newerAnchor', () => {
	it.each([
		['the newest server message', [msg('a'), msg('b'), msg('p', { status: 'pending' })], 'b'],
		['nothing when only unsent messages are loaded', [msg('p', { status: 'failed' })], null],
		['nothing when empty', [], null]
	])('is %s', (_name, loaded, expected) => {
		expect(newerAnchor(loaded)).toBe(expected);
	});
});

describe('jumpFailure', () => {
	function responseError(status: number) {
		const error = new AxiosError('failed');
		error.response = { status, data: {} } as AxiosError['response'];
		return error;
	}

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
