import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), dismiss: vi.fn(), toastError: vi.fn() }));
vi.mock('$lib/requests/announcements/getAnnouncements', () => ({ getAnnouncements: api.get }));
vi.mock('$lib/requests/announcements/dismissAnnouncement', () => ({
	dismissAnnouncement: api.dismiss
}));
vi.mock('svelte-sonner', () => ({ toast: { error: api.toastError } }));

import type { Announcement } from '$lib/types/announcement.types';
import { AnnouncementsState } from './announcementsState.svelte';

const NOW = new Date('2026-10-12T12:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

let nextId = 1;
const announcement = (patch: Partial<Announcement> = {}): Announcement => ({
	id: nextId++,
	text: 'Heads up',
	level: 'info',
	created_at: at(-60_000),
	expires_at: null,
	ended: false,
	dismissed: false,
	...patch
});

const ids = (state: AnnouncementsState) => state.active.map((a) => a.id);

const flush = () => vi.advanceTimersByTimeAsync(0);

async function loaded(items: Announcement[], userId = 1) {
	api.get.mockResolvedValue(items);
	const state = new AnnouncementsState();
	state.sync(userId);
	await flush();
	return state;
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
	vi.setSystemTime(NOW);
	nextId = 1;
	api.get.mockReset();
	api.dismiss.mockReset();
	api.toastError.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('AnnouncementsState', () => {
	it('loads for the signed-in user and applies announcement frames', async () => {
		const state = await loaded([announcement({ id: 10 })]);

		state.apply(announcement({ id: 11, created_at: at(0) }));
		expect(ids(state)).toEqual([11, 10]);

		state.apply({ ...announcement({ id: 11, created_at: at(0) }), text: 'Updated' });
		expect(state.items.filter((a) => a.id === 11)).toHaveLength(1);
	});

	it('marks an announcement ended on its frame and keeps it listed', async () => {
		const state = await loaded([announcement({ id: 10 })]);

		state.markEnded(10, at(-1000));

		expect(ids(state)).toEqual([]);
		expect(state.listed).toMatchObject([{ id: 10, ended: true, expires_at: at(-1000) }]);
	});

	it('shows the most severe first even when it is the oldest', async () => {
		const state = await loaded([
			announcement({ id: 1, level: 'incident', created_at: at(-3000) }),
			announcement({ id: 2, level: 'maintenance', created_at: at(-2000) }),
			announcement({ id: 3, level: 'info', created_at: at(-1000) }),
			announcement({ id: 4, level: 'maintenance', created_at: at(-500) })
		]);

		expect(ids(state)).toEqual([1, 4, 2, 3]);
	});

	it('breaks a tie between equal levels by newest', async () => {
		const state = await loaded([
			announcement({ id: 1, created_at: at(-3000) }),
			announcement({ id: 2, created_at: at(-1000) }),
			announcement({ id: 3, created_at: at(-2000) })
		]);

		expect(ids(state)).toEqual([2, 3, 1]);
	});

	describe('dismiss', () => {
		it('hides the announcement at once and keeps it hidden', async () => {
			const state = await loaded([announcement({ id: 10 })]);
			let finish!: () => void;
			api.dismiss.mockReturnValue(new Promise<void>((r) => (finish = r)));

			const pending = state.dismiss(10);
			expect(ids(state)).toEqual([]);
			finish();
			await pending;

			expect(api.dismiss).toHaveBeenCalledWith(10);
			expect(ids(state)).toEqual([]);
		});

		it('brings it back and tells the user when the request fails', async () => {
			const state = await loaded([announcement({ id: 10 })]);
			api.dismiss.mockRejectedValue(new Error('offline'));
			vi.spyOn(console, 'warn').mockImplementation(() => {});

			await state.dismiss(10);

			expect(ids(state)).toEqual([10]);
			expect(api.toastError).toHaveBeenCalledOnce();
		});
	});

	describe('expiry', () => {
		it('ends an announcement when its time comes, without a frame', async () => {
			const state = await loaded([announcement({ id: 10, expires_at: at(60_000) })]);

			await vi.advanceTimersByTimeAsync(59_999);
			expect(ids(state)).toEqual([10]);
			await vi.advanceTimersByTimeAsync(1);

			expect(ids(state)).toEqual([]);
			expect(state.listed[0].ended).toBe(true);
		});

		it('re-arms to the next expiry after each one', async () => {
			const state = await loaded([
				announcement({ id: 1, expires_at: at(10_000) }),
				announcement({ id: 2, expires_at: at(30_000) }),
				announcement({ id: 3 })
			]);

			await vi.advanceTimersByTimeAsync(10_000);
			expect(ids(state).sort()).toEqual([2, 3]);
			await vi.advanceTimersByTimeAsync(20_000);
			expect(ids(state)).toEqual([3]);
		});

		it('follows a newly applied announcement that expires sooner', async () => {
			const state = await loaded([announcement({ id: 1, expires_at: at(60_000) })]);

			state.apply(announcement({ id: 2, expires_at: at(5000) }));
			await vi.advanceTimersByTimeAsync(5000);

			expect(ids(state)).toEqual([1]);
		});

		it('clamps a far-away expiry to what setTimeout accepts', async () => {
			const spy = vi.spyOn(globalThis, 'setTimeout');
			const farAway = 100 * 24 * 60 * 60 * 1000;
			await loaded([announcement({ expires_at: at(farAway) })]);

			expect(spy).toHaveBeenLastCalledWith(expect.any(Function), 2 ** 31 - 1);
			spy.mockRestore();
		});

		it('sets no timer once nothing is left to expire', async () => {
			const state = await loaded([announcement({ id: 10, expires_at: at(60_000) })]);

			state.markEnded(10, at(0));

			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe('a refetch that was overtaken by a local change', () => {
		it.each([
			[
				'a dismissal',
				async (state: AnnouncementsState) => {
					api.dismiss.mockResolvedValue(undefined);
					await state.dismiss(1);
				},
				(state: AnnouncementsState) => expect(ids(state)).toEqual([])
			],
			[
				'an announcement frame',
				async (state: AnnouncementsState) => state.apply(announcement({ id: 2 })),
				(state: AnnouncementsState) => expect(ids(state).sort()).toEqual([1, 2])
			],
			[
				'an ended frame',
				async (state: AnnouncementsState) => state.markEnded(1, at(-1000)),
				(state: AnnouncementsState) => {
					expect(ids(state)).toEqual([]);
					expect(state.listed[0]).toMatchObject({ ended: true, expires_at: at(-1000) });
				}
			]
		])('keeps %s', async (_, change, check) => {
			const state = await loaded([announcement({ id: 1 })]);
			let answer!: (items: Announcement[]) => void;
			api.get.mockReturnValueOnce(new Promise<Announcement[]>((r) => (answer = r)));

			const refreshing = state.refresh();
			await change(state);
			answer([announcement({ id: 1 })]);
			await refreshing;

			check(state);
		});

		it('still takes the server state for what nothing changed locally', async () => {
			const state = await loaded([announcement({ id: 1 }), announcement({ id: 2 })]);
			let answer!: (items: Announcement[]) => void;
			api.get.mockReturnValueOnce(new Promise<Announcement[]>((r) => (answer = r)));

			const refreshing = state.refresh();
			state.apply(announcement({ id: 3 }));
			answer([announcement({ id: 1, dismissed: true }), announcement({ id: 2, ended: true })]);
			await refreshing;

			expect(ids(state)).toEqual([3]);
		});
	});

	it('refetches on request and replaces the list', async () => {
		const state = await loaded([announcement({ id: 1 })]);
		api.get.mockResolvedValue([announcement({ id: 2 })]);

		await state.refresh();

		expect(ids(state)).toEqual([2]);
	});

	describe('signing out and in', () => {
		it('clears everything on logout and stops the timer', async () => {
			const state = await loaded([announcement({ expires_at: at(60_000) })]);

			state.sync(null);

			expect(state.items).toEqual([]);
			expect(vi.getTimerCount()).toBe(0);
			state.apply(announcement());
			expect(state.items).toEqual([]);
		});

		it('drops a response that arrives after the user changed', async () => {
			let answer!: (items: Announcement[]) => void;
			api.get.mockReturnValueOnce(new Promise<Announcement[]>((r) => (answer = r)));
			const state = new AnnouncementsState();
			state.sync(1);

			state.sync(null);
			answer([announcement()]);
			await flush();

			expect(state.items).toEqual([]);
		});

		it('starts from empty and fetches for the next user', async () => {
			const state = await loaded([announcement({ id: 1 })], 1);
			api.get.mockResolvedValue([announcement({ id: 2 })]);

			state.sync(2);
			expect(state.items).toEqual([]);

			await flush();

			expect(ids(state)).toEqual([2]);
		});
	});
});
