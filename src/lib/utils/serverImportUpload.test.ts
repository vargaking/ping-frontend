import { describe, expect, it } from 'vitest';
import type { Import, ImportPiece } from '$lib/types/serverImport.types';
import {
	MAX_FAILURES,
	UPLOAD_DISCARDED,
	backoffDelay,
	failureAction,
	isSameUpload,
	nextPieceSize,
	runUpload,
	type UploadDeps,
	type UploadHooks
} from './serverImportUpload';

const CHUNK = 10;

function importWith(fields: Partial<Import>): Import {
	return {
		id: 'imp-1',
		status: 'uploading',
		filename: 'bundle.zip',
		size: 25,
		received: 0,
		source: null,
		progress: null,
		failed_step: null,
		error: null,
		plan: null,
		result: null,
		authors: [],
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		...fields
	};
}

const failure = (status: number | null, message = `failed ${status}`) =>
	Object.assign(new Error(message), { status });

type Step = ImportPiece | Error | ((offset: number, piece: Blob) => Promise<ImportPiece>);

/** Plays the given steps back, one per piece request, and records each request's offset. */
function harness(
	file: Blob,
	steps: Step[],
	fetchImport?: () => Promise<Import | null>,
	options: { chunk?: number; now?: () => number } = {}
) {
	const offsets: number[] = [];
	const sleeps: number[] = [];
	const progress: number[] = [];
	const queue = [...steps];
	const deps: UploadDeps = {
		uploadPiece: async (offset, piece) => {
			offsets.push(offset);
			const step = queue.shift();
			if (!step) throw new Error('unexpected request');
			if (step instanceof Error) throw step;
			if (typeof step === 'function') return step(offset, piece);
			return step;
		},
		fetchImport: fetchImport ?? (async () => null),
		describeError: (e) => ({
			status: (e as { status?: number | null }).status ?? null,
			message: (e as Error).message
		}),
		sleep: async (ms) => void sleeps.push(ms),
		now: options.now ?? (() => 0)
	};
	const hooks: UploadHooks = { onProgress: (received) => progress.push(received) };
	const run = (from = 0, signal = new AbortController().signal) =>
		runUpload(file, from, options.chunk ?? CHUNK, deps, hooks, signal);
	return { run, offsets, sleeps, progress };
}

const file = new Blob([new Uint8Array(25)]);

describe('backoffDelay', () => {
	it('doubles from one second and stops at thirty', () => {
		expect([1, 2, 3, 4, 5, 6, 7, 8].map(backoffDelay)).toEqual([
			1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000
		]);
	});
});

describe('failureAction', () => {
	it('retries what may pass, resyncs on 409 and stops on the rest', () => {
		expect([null, 500, 502, 503, 408, 429].map(failureAction)).toEqual(Array(6).fill('retry'));
		expect(failureAction(409)).toBe('resync');
		expect([403, 413, 422, 404, 401].map(failureAction)).toEqual(Array(5).fill('stop'));
	});
});

describe('nextPieceSize', () => {
	const KB = 1024;
	const MB = 1024 ** 2;

	it.each([
		['doubles at most when the piece was quick', MB, 1000, 64 * MB, 2 * MB],
		['aims at ten seconds of the last speed', MB, 5000, 64 * MB, 2 * MB],
		['shrinks when the piece was slow', 4 * MB, 40_000, 64 * MB, MB],
		['never goes below 256 KiB', MB, 600_000, 64 * MB, 256 * KB],
		['never goes above the server limit', 8 * MB, 100, 10 * MB, 10 * MB],
		['takes the limit when it is below the minimum', 5, 100, 10, 10],
		['doubles when the time is not measurable', MB, 0, 64 * MB, 2 * MB]
	])('%s', (_name, sent, elapsed, chunk, expected) => {
		expect(nextPieceSize(sent, elapsed, chunk)).toBe(expected);
	});
});

describe('isSameUpload', () => {
	const existing = { filename: 'bundle.zip', size: 3 };

	it('needs the same name and size', () => {
		expect(isSameUpload(existing, new File(['abc'], 'bundle.zip'))).toBe(true);
		expect(isSameUpload(existing, new File(['abcd'], 'bundle.zip'))).toBe(false);
		expect(isSameUpload(existing, new File(['abc'], 'other.zip'))).toBe(false);
	});
});

describe('runUpload', () => {
	it('sends the pieces in order with their offsets', async () => {
		const sizes: number[] = [];
		const piece =
			(received: number, status: ImportPiece['status'] = 'uploading') =>
			async (_offset: number, blob: Blob) => {
				sizes.push(blob.size);
				return { received, status };
			};
		const { run, offsets, progress } = harness(file, [
			piece(10),
			piece(20),
			piece(25, 'unpacking')
		]);

		expect(await run()).toEqual({ kind: 'finished' });
		expect(offsets).toEqual([0, 10, 20]);
		expect(sizes).toEqual([10, 10, 5]);
		expect(progress).toEqual([10, 20, 25]);
	});

	it('starts at the given position', async () => {
		const { run, offsets } = harness(file, [
			{ received: 20, status: 'uploading' },
			{ received: 25, status: 'unpacking' }
		]);

		await run(10);
		expect(offsets).toEqual([10, 20]);
	});

	it('goes on from what the server has after a 409', async () => {
		const { run, offsets, sleeps } = harness(
			file,
			[
				{ received: 10, status: 'uploading' },
				failure(409, 'Wrong offset'),
				{ received: 25, status: 'unpacking' }
			],
			async () => importWith({ received: 20 })
		);

		expect(await run()).toEqual({ kind: 'finished' });
		expect(offsets).toEqual([0, 10, 20]);
		expect(sleeps).toEqual([]);
	});

	it('counts a 409 that leaves the offset where it was as a failure', async () => {
		const { run, offsets, sleeps } = harness(
			file,
			[failure(409), { received: 10, status: 'uploading' }, { received: 25, status: 'unpacking' }],
			async () => importWith({ received: 0 })
		);

		await run();
		expect(offsets).toEqual([0, 0, 10]);
		expect(sleeps).toEqual([1000]);
	});

	it('stops showing whatever state the import is in once it no longer takes data', async () => {
		const unpacking = importWith({ status: 'unpacking', received: 25 });
		const { run } = harness(file, [failure(409)], async () => unpacking);

		expect(await run()).toEqual({ kind: 'superseded', import: unpacking });
	});

	it('retries the same piece with growing waits and pauses after eight failures in a row', async () => {
		const { run, offsets, sleeps } = harness(
			file,
			Array.from({ length: MAX_FAILURES }, () => failure(503, 'Unavailable'))
		);

		expect(await run()).toEqual({ kind: 'paused', error: 'Unavailable' });
		expect(offsets).toEqual(Array(MAX_FAILURES).fill(0));
		expect(sleeps).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
	});

	it('treats a dropped connection as a failure to retry', async () => {
		const { run, offsets, sleeps } = harness(file, [
			failure(null, 'Cannot reach the server'),
			{ received: 10, status: 'uploading' },
			{ received: 25, status: 'unpacking' }
		]);

		expect(await run()).toEqual({ kind: 'finished' });
		expect(offsets).toEqual([0, 0, 10]);
		expect(sleeps).toEqual([1000]);
	});

	it('starts counting again once a piece goes through', async () => {
		const { run, sleeps } = harness(file, [
			failure(500),
			failure(500),
			{ received: 10, status: 'uploading' },
			failure(500),
			{ received: 20, status: 'uploading' },
			{ received: 25, status: 'unpacking' }
		]);

		await run();
		expect(sleeps).toEqual([1000, 2000, 1000]);
	});

	it('says the import was discarded elsewhere on a 404', async () => {
		const { run, offsets } = harness(file, [failure(404, 'Import not found')]);

		expect(await run()).toEqual({ kind: 'stopped', error: UPLOAD_DISCARDED });
		expect(offsets).toEqual([0]);
	});

	it('grows the pieces while they go through quickly', async () => {
		const MB = 1024 ** 2;
		const big = new Blob([new Uint8Array(10 * MB)]);
		let clock = 0;
		const sizes: number[] = [];
		const accept = async (offset: number, piece: Blob): Promise<ImportPiece> => {
			sizes.push(piece.size);
			clock += 1000;
			const received = offset + piece.size;
			return { received, status: received >= big.size ? 'unpacking' : 'uploading' };
		};
		const { run } = harness(big, [accept, accept, accept, accept], undefined, {
			chunk: 8 * MB,
			now: () => clock
		});

		expect(await run()).toEqual({ kind: 'finished' });
		expect(sizes).toEqual([MB, 2 * MB, 4 * MB, 3 * MB]);
	});

	it.each([403, 413, 422])('stops with the message on a %i', async (status) => {
		const { run, offsets, sleeps } = harness(file, [failure(status, 'Not allowed')]);

		expect(await run()).toEqual({ kind: 'stopped', error: 'Not allowed' });
		expect(offsets).toEqual([0]);
		expect(sleeps).toEqual([]);
	});

	it('does not spin when the server accepts a piece without moving forward', async () => {
		const { run, sleeps } = harness(file, [
			{ received: 0, status: 'uploading' },
			{ received: 10, status: 'uploading' },
			{ received: 25, status: 'unpacking' }
		]);

		expect(await run()).toEqual({ kind: 'finished' });
		expect(sleeps).toEqual([1000]);
	});

	it('aborts the request in flight when cancelled', async () => {
		const controller = new AbortController();
		let aborted = false;
		const { run } = harness(file, [
			() =>
				new Promise<ImportPiece>((_resolve, reject) => {
					controller.signal.addEventListener('abort', () => {
						aborted = true;
						reject(failure(null, 'canceled'));
					});
				})
		]);

		const result = run(0, controller.signal);
		controller.abort();

		expect(await result).toEqual({ kind: 'cancelled' });
		expect(aborted).toBe(true);
	});

	it('sends nothing when already cancelled', async () => {
		const controller = new AbortController();
		controller.abort();
		const { run, offsets } = harness(file, []);

		expect(await run(0, controller.signal)).toEqual({ kind: 'cancelled' });
		expect(offsets).toEqual([]);
	});
});
