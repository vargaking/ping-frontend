import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, untrack } from 'svelte';
import type { ImportsResponse } from '$lib/types/serverImport.types';

const get = vi.hoisted(() => vi.fn());

vi.mock('$lib/requests/serverImport/getServerImport', () => ({ getServerImport: get }));
vi.mock('$lib/requests/serverImport/createServerImport', () => ({ createServerImport: vi.fn() }));
vi.mock('$lib/requests/serverImport/uploadImportPiece', () => ({ uploadImportPiece: vi.fn() }));
vi.mock('$lib/requests/serverImport/saveImportAuthors', () => ({ saveImportAuthors: vi.fn() }));
vi.mock('$lib/requests/serverImport/startServerImport', () => ({ startServerImport: vi.fn() }));
vi.mock('$lib/requests/serverImport/discardServerImport', () => ({
	discardServerImport: vi.fn()
}));
vi.mock('$lib/requests/attachments/uploadAttachment', () => ({
	formatBytes: (n: number) => `${n} B`
}));

import { serverImportState } from './serverImportState.svelte';

// A fresh limits object each time, like a real response.
const answer = (): ImportsResponse => ({
	limits: { max_bytes: 1000, chunk_bytes: 10 },
	import: null
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

beforeEach(() => {
	get.mockReset();
	// A runaway loop stops being answered, so it fails the count instead of hanging the run.
	get.mockImplementation(() =>
		get.mock.calls.length > 100 ? new Promise(() => {}) : Promise.resolve(answer())
	);
});

afterEach(() => serverImportState.reset());

describe('loading from an effect', () => {
	it('fetches once when the effect runs untracked, and again only for a new server', async () => {
		let serverId = $state(1);
		const stop = $effect.root(() => {
			$effect(() => {
				const id = serverId;
				untrack(() => void serverImportState.load(id));
			});
		});

		flushSync();
		await settle();
		expect(get).toHaveBeenCalledTimes(1);

		serverId = 2;
		flushSync();
		await settle();
		expect(get).toHaveBeenCalledTimes(2);
		stop();
	});

	it('settles even when an effect tracks what load reads', async () => {
		const stop = $effect.root(() => {
			$effect(() => {
				void serverImportState.load(1);
			});
		});

		flushSync();
		await settle();
		const settled = get.mock.calls.length;
		await settle();

		// The first answer fills in the limits, which such an effect notices a few times at most.
		expect(settled).toBeGreaterThanOrEqual(1);
		expect(settled).toBeLessThan(5);
		expect(get.mock.calls.length).toBe(settled);
		stop();
	});
});

describe('reactivity', () => {
	it('tells readers when the first load fills in a new entry', async () => {
		const seen: string[] = [];
		const stop = $effect.root(() => {
			$effect(() => {
				seen.push(serverImportState.of(1).loadStatus);
			});
		});
		flushSync();
		await serverImportState.load(1);
		flushSync();

		expect(seen.at(-1)).toBe('ready');
		stop();
	});
});

describe('polling timers', () => {
	const working = (status: 'importing' | 'done') => ({
		limits: { max_bytes: 1000, chunk_bytes: 10 },
		import: { id: 'i', status, authors: [] } as never
	});

	it('keeps one timer per server, clears it when the work ends and when the server is forgotten', async () => {
		vi.useFakeTimers();
		try {
			const started = vi.spyOn(globalThis, 'setInterval');
			const cleared = vi.spyOn(globalThis, 'clearInterval');

			get.mockResolvedValue(working('importing'));
			await serverImportState.load(1);
			await serverImportState.load(1);
			await serverImportState.load(1);
			expect(started).toHaveBeenCalledTimes(1);

			get.mockResolvedValue(working('done'));
			await serverImportState.load(1);
			expect(cleared).toHaveBeenCalledTimes(1);
			get.mockClear();
			await vi.advanceTimersByTimeAsync(60_000);
			expect(get).not.toHaveBeenCalled();

			get.mockResolvedValue(working('importing'));
			await serverImportState.load(2);
			expect(started).toHaveBeenCalledTimes(2);
			serverImportState.forget(2);
			expect(cleared).toHaveBeenCalledTimes(2);
			get.mockClear();
			await vi.advanceTimersByTimeAsync(60_000);
			expect(get).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
			vi.restoreAllMocks();
		}
	});
});
