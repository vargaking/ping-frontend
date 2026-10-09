import { describe, expect, it } from 'vitest';
import type { ServerRequest } from '$lib/types/serverRequest.types';
import { pastRequests, sentOn, STATUS_LABELS, upsertRequest } from './serverRequests';

function request(id: number, patch: Partial<ServerRequest> = {}): ServerRequest {
	return {
		id,
		name: `Server ${id}`,
		description: 'A place to talk',
		expected_size: 'lt10',
		status: 'pending',
		decline_reason: null,
		created_at: '2026-10-09T12:00:00Z',
		decided_at: null,
		server_id: null,
		...patch
	};
}

describe('pastRequests', () => {
	it('leaves out the current request', () => {
		const history = [request(3), request(2), request(1)];
		expect(pastRequests(history, history[0]).map((r) => r.id)).toEqual([2, 1]);
	});

	it('keeps everything when there is no current request', () => {
		const history = [request(2, { status: 'withdrawn' }), request(1)];
		expect(pastRequests(history, null)).toEqual(history);
	});

	it('matches by id, not by object identity', () => {
		const history = [request(2), request(1)];
		expect(pastRequests(history, request(2)).map((r) => r.id)).toEqual([1]);
	});

	it('is unchanged when the current request is missing from the history', () => {
		const history = [request(2), request(1)];
		expect(pastRequests(history, request(9))).toEqual(history);
	});
});

describe('upsertRequest', () => {
	it('replaces a request in place', () => {
		const history = [request(2), request(1)];
		const declined = request(1, { status: 'declined', decline_reason: 'Not now' });
		expect(upsertRequest(history, declined)).toEqual([history[0], declined]);
	});

	it('puts a new request first', () => {
		const history = [request(1)];
		expect(upsertRequest(history, request(2)).map((r) => r.id)).toEqual([2, 1]);
	});
});

describe('labels', () => {
	it('names every status', () => {
		expect(STATUS_LABELS).toEqual({
			pending: 'Pending',
			approved: 'Approved',
			declined: 'Declined',
			withdrawn: 'Withdrawn'
		});
	});

	it('formats the sent date', () => {
		expect(sentOn('2026-10-09T12:00:00')).toBe('Oct 9, 2026');
	});
});
