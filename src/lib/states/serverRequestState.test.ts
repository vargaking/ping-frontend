import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
	getMine: vi.fn(),
	getHistory: vi.fn(),
	create: vi.fn(),
	withdraw: vi.fn()
}));
vi.mock('$lib/requests/serverRequests/getMyServerRequest', () => ({
	getMyServerRequest: api.getMine
}));
vi.mock('$lib/requests/serverRequests/getMyServerRequestHistory', () => ({
	getMyServerRequestHistory: api.getHistory
}));
vi.mock('$lib/requests/serverRequests/createServerRequest', () => ({
	createServerRequest: api.create
}));
vi.mock('$lib/requests/serverRequests/withdrawServerRequest', () => ({
	withdrawServerRequest: api.withdraw
}));

import type { MyServerRequestState, ServerRequest } from '$lib/types/serverRequest.types';
import { ServerRequestState } from './serverRequestState.svelte';

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

function mine(patch: Partial<MyServerRequestState> = {}): MyServerRequestState {
	return { mode: 'waitlist', can_create: false, request: null, ...patch };
}

async function loaded(state: MyServerRequestState) {
	api.getMine.mockResolvedValue(state);
	const requests = new ServerRequestState();
	await requests.load();
	return requests;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	api.getHistory.mockResolvedValue([]);
});

describe('modes', () => {
	it('asks for a request only in waitlist mode and only for non-admins', async () => {
		expect((await loaded(mine())).mustRequest).toBe(true);
		expect((await loaded(mine({ can_create: true }))).mustRequest).toBe(false);
		expect((await loaded(mine({ mode: 'open', can_create: true }))).mustRequest).toBe(false);
	});

	it('knows the waitlist even for admins, and not before it has loaded', async () => {
		expect(new ServerRequestState().waitlist).toBe(false);
		expect((await loaded(mine({ can_create: true }))).waitlist).toBe(true);
		expect((await loaded(mine({ mode: 'open', can_create: true }))).waitlist).toBe(false);
	});

	it('loads once when asked to ensure it', async () => {
		api.getMine.mockResolvedValue(mine());
		const requests = new ServerRequestState();
		await requests.ensureLoaded();
		await requests.ensureLoaded();
		expect(api.getMine).toHaveBeenCalledTimes(1);
	});
});

describe('history', () => {
	it('lists the past requests without the current one', async () => {
		const requests = await loaded(mine({ request: request(3) }));
		api.getHistory.mockResolvedValue([request(3), request(2, { status: 'declined' }), request(1)]);
		await requests.loadHistory();
		expect(requests.past.map((r) => r.id)).toEqual([2, 1]);
	});

	it('keeps the current request and flags the failure when the history fails', async () => {
		const requests = await loaded(mine({ request: request(3) }));
		api.getHistory.mockRejectedValueOnce(new Error('404'));
		await requests.loadHistory();
		expect(requests.historyFailed).toBe(true);
		expect(requests.historyLoading).toBe(false);
		expect(requests.mine?.request?.id).toBe(3);
		expect(requests.past).toEqual([]);

		api.getHistory.mockResolvedValue([request(3), request(2)]);
		await requests.loadHistory();
		expect(requests.historyFailed).toBe(false);
		expect(requests.past.map((r) => r.id)).toEqual([2]);
	});

	it('shares a history load that is still running', async () => {
		const requests = await loaded(mine());
		const first = requests.loadHistory();
		const second = requests.loadHistory();
		expect(second).toBe(first);
		await first;
		expect(api.getHistory).toHaveBeenCalledTimes(1);
	});

	it('follows a decision and then a new request', async () => {
		const requests = await loaded(mine({ request: request(1) }));
		api.getHistory.mockResolvedValue([request(1)]);
		await requests.loadHistory();

		const declined = request(1, { status: 'declined', decline_reason: 'Not now' });
		requests.apply(declined);
		expect(requests.mine?.request).toEqual(declined);
		expect(requests.history).toEqual([declined]);
		expect(requests.past).toEqual([]);

		const next = request(2);
		api.create.mockResolvedValue(next);
		await requests.submit({
			name: next.name,
			description: next.description,
			expected_size: 'lt10'
		});
		expect(requests.mine?.request).toEqual(next);
		expect(requests.past).toEqual([declined]);

		const approved = request(2, { status: 'approved', server_id: 7 });
		requests.apply(approved);
		expect(requests.mine?.request?.status).toBe('approved');
		expect(requests.past).toEqual([declined]);
	});

	it('moves a withdrawn request to the past list', async () => {
		const pending = request(1);
		const requests = await loaded(mine({ request: pending }));
		api.getHistory.mockResolvedValue([pending]);
		await requests.loadHistory();

		api.withdraw.mockResolvedValue(undefined);
		await requests.withdraw();
		expect(requests.mine?.request).toBeNull();
		expect(requests.past).toEqual([{ ...pending, status: 'withdrawn' }]);
	});

	it('keeps a decision that arrives while the history is loading', async () => {
		const requests = await loaded(mine({ request: request(1) }));
		let resolve!: (list: ServerRequest[]) => void;
		api.getHistory.mockReturnValue(new Promise((r) => (resolve = r)));
		const load = requests.loadHistory();

		const declined = request(1, { status: 'declined' });
		requests.apply(declined);
		const next = request(2);
		requests.apply(next);
		resolve([request(1)]);
		await load;

		expect(requests.history).toEqual([next, declined]);
	});

	it('ignores a history response that arrives after a reset', async () => {
		const requests = await loaded(mine());
		let resolve!: (list: ServerRequest[]) => void;
		api.getHistory.mockReturnValue(new Promise((r) => (resolve = r)));
		const load = requests.loadHistory();
		requests.reset();
		resolve([request(1)]);
		await load;

		expect(requests.history).toBeNull();
		expect(requests.mine).toBeNull();
	});
});
