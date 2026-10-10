import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWhatsNewState } from '$lib/requests/whatsNew/getWhatsNewState';
import { markWhatsNewSeen } from '$lib/requests/whatsNew/markWhatsNewSeen';
import type { WhatsNewEntry, WhatsNewSeen } from '$lib/types/whatsNew.types';
import { WhatsNewState } from './whatsNewState.svelte';

vi.mock('$lib/requests/whatsNew/getWhatsNewState', () => ({ getWhatsNewState: vi.fn() }));
vi.mock('$lib/requests/whatsNew/markWhatsNewSeen', () => ({ markWhatsNewSeen: vi.fn() }));

const getMock = vi.mocked(getWhatsNewState);
const putMock = vi.mocked(markWhatsNewSeen);

function entry(id: string): WhatsNewEntry {
	return { id, date: id.slice(0, 10), title: id, bullets: ['b'] };
}

const ENTRIES = [entry('2026-10-10'), entry('2026-10-06')];

function answer(last_seen_id: string | null, created_on = '2026-10-01'): WhatsNewSeen {
	return { last_seen_id, created_on };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loaded(seen: WhatsNewSeen, userId = 1) {
	getMock.mockResolvedValue(seen);
	const state = new WhatsNewState(ENTRIES);
	state.sync(userId);
	await flush();
	return state;
}

beforeEach(() => {
	getMock.mockReset();
	putMock.mockReset();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('loading', () => {
	it('has no unseen entries before the state loads', () => {
		const state = new WhatsNewState(ENTRIES);
		expect(state.hasUnseen).toBe(false);
		getMock.mockReturnValue(new Promise(() => {}));
		state.sync(1);
		expect(state.hasUnseen).toBe(false);
	});

	it('has no unseen entries after a failed load', async () => {
		getMock.mockRejectedValue(new Error('404'));
		const state = new WhatsNewState(ENTRIES);
		state.sync(1);
		await flush();
		expect(state.seen).toBeNull();
		expect(state.hasUnseen).toBe(false);
	});

	it('loads on sync and does not refetch for the same user', async () => {
		const state = await loaded(answer(null));
		expect(getMock).toHaveBeenCalledTimes(1);
		expect(state.hasUnseen).toBe(true);
		state.sync(1);
		expect(getMock).toHaveBeenCalledTimes(1);
	});

	it('keeps the last answer when a refresh fails', async () => {
		const state = await loaded(answer(null));
		getMock.mockRejectedValue(new Error('offline'));
		await state.refresh();
		expect(state.hasUnseen).toBe(true);
	});

	it('does nothing on refresh without a user', async () => {
		const state = new WhatsNewState(ENTRIES);
		await state.refresh();
		expect(getMock).not.toHaveBeenCalled();
	});

	it('clears everything when the user goes away', async () => {
		const state = await loaded(answer(null));
		state.sync(null);
		expect(state.seen).toBeNull();
		expect(state.hasUnseen).toBe(false);
	});

	it('ignores a stale answer after the user changed', async () => {
		const first = deferred<WhatsNewSeen>();
		getMock.mockReturnValueOnce(first.promise);
		const state = new WhatsNewState(ENTRIES);
		state.sync(1);
		getMock.mockResolvedValueOnce(answer('2026-10-10'));
		state.sync(2);
		await flush();
		first.resolve(answer(null));
		await flush();
		expect(state.seen?.last_seen_id).toBe('2026-10-10');
		expect(state.hasUnseen).toBe(false);
	});
});

describe('markAllSeen', () => {
	it('clears the dot at once and stores the newest id', async () => {
		const state = await loaded(answer(null));
		putMock.mockResolvedValue({ last_seen_id: '2026-10-10' });
		const pending = state.markAllSeen();
		expect(state.hasUnseen).toBe(false);
		await pending;
		expect(putMock).toHaveBeenCalledExactlyOnceWith('2026-10-10');
		expect(state.seen?.last_seen_id).toBe('2026-10-10');
	});

	it('does not send anything when the server already covers the newest', async () => {
		const state = await loaded(answer('2026-10-10'));
		await state.markAllSeen();
		expect(putMock).not.toHaveBeenCalled();
	});

	it('keeps the dot cleared after a failed save and retries on the next open', async () => {
		const state = await loaded(answer(null));
		putMock.mockRejectedValueOnce(new Error('offline'));
		await state.markAllSeen();
		expect(state.hasUnseen).toBe(false);
		expect(state.seen?.last_seen_id).toBeNull();

		putMock.mockResolvedValueOnce({ last_seen_id: '2026-10-10' });
		await state.markAllSeen();
		expect(putMock).toHaveBeenCalledTimes(2);
		expect(state.seen?.last_seen_id).toBe('2026-10-10');
	});

	it('keeps a newer id from the server answer', async () => {
		const state = await loaded(answer(null));
		putMock.mockResolvedValue({ last_seen_id: '2027-01-01' });
		await state.markAllSeen();
		expect(state.seen?.last_seen_id).toBe('2027-01-01');
	});

	it('drops the answer when the user changed meanwhile', async () => {
		const state = await loaded(answer(null));
		const put = deferred<{ last_seen_id: string }>();
		putMock.mockReturnValue(put.promise);
		const pending = state.markAllSeen();
		getMock.mockResolvedValue(answer(null, '2026-10-02'));
		state.sync(2);
		await flush();
		put.resolve({ last_seen_id: '2026-10-10' });
		await pending;
		expect(state.seen?.last_seen_id).toBeNull();
		expect(state.hasUnseen).toBe(true);
	});

	it('does nothing without a user', async () => {
		const state = new WhatsNewState(ENTRIES);
		await state.markAllSeen();
		expect(putMock).not.toHaveBeenCalled();
	});
});
