import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	NEAR_TOP_PX,
	OlderHistory,
	SKELETON_DELAY_MS,
	wantsOlder,
	type ScrollPosition
} from './olderHistory.svelte';

const VIEW = 800;
const PAGE_HEIGHT = 300;

type Page = { messages: number };

/**
 * A list whose pages each add PAGE_HEIGHT. Afterwards the view is `pinned` to the messages it
 * showed (so it moves down by the page), `stay`s at the same offset (the user is still at the
 * top) or goes to the `bottom` (a list that was opened and not scrolled).
 */
function setup({
	pages = 5,
	height = 2000,
	top = 0,
	view = 'pinned',
	fetch
}: {
	pages?: number;
	height?: number;
	top?: number;
	view?: 'pinned' | 'stay' | 'bottom';
	fetch?: () => Promise<Page>;
} = {}) {
	const position: { -readonly [K in keyof ScrollPosition]: ScrollPosition[K] } = {
		scrollHeight: height,
		scrollTop: top,
		clientHeight: VIEW
	};
	let remaining = pages;
	let opening = false;
	const fetched = vi.fn(fetch ?? (async () => ({ messages: 10 })));
	const older = new OlderHistory<Page>({
		metrics: () => position,
		available: () => !opening && remaining > 0,
		fetch: fetched,
		apply(page) {
			remaining--;
			position.scrollHeight += PAGE_HEIGHT;
			return page.messages;
		},
		async keepView(change) {
			change();
			await Promise.resolve();
			if (view === 'pinned') position.scrollTop += PAGE_HEIGHT;
			if (view === 'bottom') position.scrollTop = Math.max(0, position.scrollHeight - VIEW);
		}
	});
	return {
		older,
		position,
		fetched,
		setOpening: (value: boolean) => (opening = value)
	};
}

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('wantsOlder', () => {
	it('is true up to the threshold and false past it', () => {
		const at = (scrollTop: number) => ({ scrollHeight: 5000, clientHeight: VIEW, scrollTop });
		expect(wantsOlder(at(0))).toBe(true);
		expect(wantsOlder(at(NEAR_TOP_PX))).toBe(true);
		expect(wantsOlder(at(NEAR_TOP_PX + 1))).toBe(false);
	});

	it('is true for a list that does not overflow, wherever it is scrolled', () => {
		expect(wantsOlder({ scrollHeight: 500, clientHeight: VIEW, scrollTop: 0 })).toBe(true);
		expect(wantsOlder({ scrollHeight: VIEW + 3, clientHeight: VIEW, scrollTop: 3 })).toBe(true);
	});
});

describe('reaching the top', () => {
	it('loads when the scroll that follows an early observer callback ends at the top', async () => {
		const { older, position, fetched } = setup({ pages: 1, top: 160 });

		await older.request();
		expect(fetched).not.toHaveBeenCalled();

		position.scrollTop = 0;
		await older.request();
		expect(fetched).toHaveBeenCalledTimes(1);
	});

	it('loads again when the user is still at the top after a page arrives', async () => {
		const { older, fetched } = setup({ pages: 3, view: 'stay' });

		await older.request();

		expect(fetched).toHaveBeenCalledTimes(3);
	});

	it('stops once the page puts the user away from the top', async () => {
		const { older, fetched } = setup({ pages: 3 });

		await older.request();

		expect(fetched).toHaveBeenCalledTimes(1);
	});

	it('does not load while the thread is still opening', async () => {
		const { older, fetched, setOpening } = setup({ top: 0 });
		setOpening(true);

		await older.request();

		expect(fetched).not.toHaveBeenCalled();
	});

	it('shares one fetch between overlapping requests', async () => {
		const { older, fetched } = setup({ pages: 1 });

		await Promise.all([older.request(), older.request(), older.request()]);

		expect(fetched).toHaveBeenCalledTimes(1);
	});
});

describe('a first page that is shorter than the view', () => {
	it('keeps loading until the list overflows, then stays at the bottom', async () => {
		const { older, position, fetched } = setup({ pages: 10, height: 400, view: 'bottom' });

		await older.request();

		expect(fetched).toHaveBeenCalledTimes(2);
		expect(position.scrollHeight).toBeGreaterThan(VIEW);
	});

	it('stops when there is nothing older', async () => {
		const { older, fetched } = setup({ pages: 2, height: 100, view: 'bottom' });

		await older.request();

		expect(fetched).toHaveBeenCalledTimes(2);
	});

	it('does not touch a list that already overflows and sits at the bottom', async () => {
		const { older, position, fetched } = setup({ pages: 10, height: 3000 });
		position.scrollTop = 3000 - VIEW;

		await older.request();

		expect(fetched).not.toHaveBeenCalled();
	});
});

describe('a failed fetch', () => {
	it('shows the failure, loads nothing further, and retries on the next request', async () => {
		let fail = true;
		const { older, fetched } = setup({
			pages: 1,
			view: 'stay',
			fetch: async () => {
				if (fail) throw new Error('offline');
				return { messages: 10 };
			}
		});

		await older.request();
		expect(older.failed).toBe(true);
		expect(older.loading).toBe(false);
		expect(fetched).toHaveBeenCalledTimes(1);

		fail = false;
		await older.request();
		expect(fetched).toHaveBeenCalledTimes(2);
		expect(older.failed).toBe(false);
	});

	it('asks once per request while offline', async () => {
		const { older, fetched } = setup({
			pages: 5,
			fetch: async () => {
				throw new Error('offline');
			}
		});

		await older.request();
		await Promise.resolve();

		expect(fetched).toHaveBeenCalledTimes(1);
	});

	it('retries from a button wherever the view is', async () => {
		let fail = true;
		const { older, position, fetched } = setup({
			pages: 1,
			view: 'stay',
			fetch: async () => {
				if (fail) throw new Error('offline');
				return { messages: 10 };
			}
		});
		await older.request();
		position.scrollTop = 1000;

		fail = false;
		await older.request();
		expect(fetched).toHaveBeenCalledTimes(1);

		await older.request(true);
		expect(fetched).toHaveBeenCalledTimes(2);
		expect(older.failed).toBe(false);
	});

	it('keeps showing the failure while a retry is under way', async () => {
		let fail = true;
		let release = () => {};
		const { older } = setup({
			pages: 1,
			fetch: async () => {
				if (fail) throw new Error('offline');
				await new Promise<void>((resolve) => (release = resolve));
				return { messages: 10 };
			}
		});
		await older.request();

		fail = false;
		const retry = older.request(true);
		expect(older.failed).toBe(true);
		expect(older.loading).toBe(true);

		release();
		await retry;
		expect(older.failed).toBe(false);
	});
});

describe('placeholder rows', () => {
	beforeEach(() => vi.useFakeTimers());

	const slowFetch = (ms: number) => () =>
		new Promise<Page>((resolve) => setTimeout(() => resolve({ messages: 10 }), ms));

	it('stay hidden for a fetch that finishes within the delay', async () => {
		const { older } = setup({ pages: 1, fetch: slowFetch(SKELETON_DELAY_MS - 50) });

		const request = older.request();
		await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS - 60);
		expect(older.loading).toBe(true);
		expect(older.slow).toBe(false);

		await vi.advanceTimersByTimeAsync(100);
		await request;
		expect(older.slow).toBe(false);
		expect(older.loading).toBe(false);
	});

	it('show for a slower fetch and go away with the page', async () => {
		const { older } = setup({ pages: 1, fetch: slowFetch(SKELETON_DELAY_MS + 300) });

		const request = older.request();
		await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS + 1);
		expect(older.slow).toBe(true);

		await vi.advanceTimersByTimeAsync(300);
		await request;
		expect(older.slow).toBe(false);
	});

	it('are replaced by the failure when the fetch fails', async () => {
		const { older } = setup({
			pages: 1,
			fetch: () =>
				new Promise<Page>((_, reject) =>
					setTimeout(() => reject(new Error('offline')), SKELETON_DELAY_MS + 100)
				)
		});

		const request = older.request();
		await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS + 1);
		expect(older.slow).toBe(true);

		await vi.advanceTimersByTimeAsync(100);
		await request;
		expect(older.slow).toBe(false);
		expect(older.failed).toBe(true);
	});
});

describe('switching threads', () => {
	it('drops a page that arrives after reset and lets the new thread load', async () => {
		let release = () => {};
		let first = true;
		const { older, fetched } = setup({
			pages: 5,
			fetch: async () => {
				if (first) {
					first = false;
					await new Promise<void>((resolve) => (release = resolve));
				}
				return { messages: 10 };
			}
		});

		const stale = older.request();
		older.reset();
		expect(older.loading).toBe(false);

		const fresh = older.request();
		release();
		await Promise.all([stale, fresh]);

		expect(fetched).toHaveBeenCalledTimes(2);
	});
});
