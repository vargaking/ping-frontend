import { AxiosError } from 'axios';
import { flushSync, untrack } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvitePublicResponse } from '$lib/types/invite.types';

const mocks = vi.hoisted(() => ({ getInvite: vi.fn() }));
vi.mock('$lib/requests/invites', () => ({ getInvite: mocks.getInvite }));

import { InviteCardsState } from './inviteCardsState.svelte';

function invite(extra: Partial<InvitePublicResponse> = {}): InvitePublicResponse {
	return {
		id: 'code-a',
		server_id: 3,
		server_name: 'Guild',
		server_icon: null,
		member_count: 4,
		is_valid: true,
		has_password: false,
		...extra
	};
}

function httpError(status: number) {
	return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
		status,
		data: {},
		statusText: '',
		headers: {},
		config: {} as never
	});
}

let cards: InviteCardsState;

beforeEach(() => {
	vi.resetAllMocks();
	mocks.getInvite.mockResolvedValue(invite());
	cards = new InviteCardsState();
});

describe('InviteCardsState', () => {
	it('updates a reader that looked before anything was loaded', async () => {
		let seen: unknown;
		const stop = $effect.root(() => {
			const entry = $derived(cards.entry('code-a', 1));
			$effect(() => {
				seen = entry;
			});
			$effect(() => {
				untrack(() => void cards.load('code-a', 1));
			});
		});
		flushSync();
		expect(seen).toBeUndefined();

		await vi.waitFor(() => {
			flushSync();
			expect(seen).toEqual({ status: 'ready', invite: invite() });
		});
		stop();
	});

	it('has no entry until the lookup finishes, then shares it', async () => {
		const loading = cards.load('code-a', 1);
		expect(cards.entry('code-a', 1)).toBeUndefined();

		await loading;

		expect(cards.entry('code-a', 1)).toEqual({ status: 'ready', invite: invite() });
	});

	it('makes one request for several readers, in flight and afterwards', async () => {
		await Promise.all([cards.load('code-a', 1), cards.load('code-a', 1), cards.load('code-a', 1)]);
		await cards.load('code-a', 1);

		expect(mocks.getInvite).toHaveBeenCalledTimes(1);
	});

	it('looks each code up separately', async () => {
		await cards.load('code-a', 1);
		await cards.load('code-b', 1);

		expect(mocks.getInvite.mock.calls.map(([code]) => code)).toEqual(['code-a', 'code-b']);
	});

	it.each([
		[404, 'gone'],
		[500, 'failed'],
		[null, 'failed']
	])('remembers a %s answer as %s without asking again', async (status, expected) => {
		mocks.getInvite.mockRejectedValue(status === null ? new Error('offline') : httpError(status));

		await cards.load('code-a', 1);
		await cards.load('code-a', 1);

		expect(cards.entry('code-a', 1)).toEqual({ status: expected });
		expect(mocks.getInvite).toHaveBeenCalledTimes(1);
	});

	it('replaces the entry on refresh without clearing it first', async () => {
		await cards.load('code-a', 1);
		mocks.getInvite.mockResolvedValue(invite({ member_count: 5 }));

		const refreshing = cards.refresh('code-a', 1);
		expect(cards.entry('code-a', 1)).toMatchObject({ invite: { member_count: 4 } });
		await refreshing;

		expect(cards.entry('code-a', 1)).toMatchObject({ invite: { member_count: 5 } });
	});

	it('keeps the old entry when a refresh fails', async () => {
		await cards.load('code-a', 1);
		mocks.getInvite.mockRejectedValue(new Error('offline'));

		await cards.refresh('code-a', 1);

		expect(cards.entry('code-a', 1)).toMatchObject({ status: 'ready' });
	});

	it('is emptied by reset', async () => {
		await cards.load('code-a', 1);

		cards.reset();

		expect(cards.entry('code-a', 1)).toBeUndefined();
		await cards.load('code-a', 1);
		expect(mocks.getInvite).toHaveBeenCalledTimes(2);
	});

	it('drops what another user loaded', async () => {
		await cards.load('code-a', 1);

		expect(cards.entry('code-a', 2)).toBeUndefined();
		await cards.load('code-a', 2);

		expect(mocks.getInvite).toHaveBeenCalledTimes(2);
		expect(cards.entry('code-a', 1)).toBeUndefined();
		expect(cards.entry('code-a', 2)).toMatchObject({ status: 'ready' });
	});

	it('ignores an answer that arrives after the user changed', async () => {
		let answer: (value: InvitePublicResponse) => void = () => {};
		mocks.getInvite.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

		const stale = cards.load('code-a', 1);
		const fresh = cards.load('code-a', 2);
		answer(invite({ member_count: 99 }));
		await Promise.all([stale, fresh]);

		expect(cards.entry('code-a', 1)).toBeUndefined();
		expect(cards.entry('code-a', 2)).toMatchObject({ invite: { member_count: 4 } });
	});
});
