import type { Import, ImportPiece } from '$lib/types/serverImport.types';

export const MAX_FAILURES = 8;
const BACKOFF_START_MS = 1000;
const BACKOFF_CAP_MS = 30_000;
const FIRST_PIECE_BYTES = 1024 ** 2;
const MIN_PIECE_BYTES = 256 * 1024;
const PIECE_TARGET_MS = 10_000;

export const UPLOAD_DISCARDED = 'The upload was discarded from another tab or device.';

/**
 * The server only sees a piece once it has fully arrived, so pieces sized to take
 * about ten seconds keep another device's view of the upload alive on slow links.
 * About ten seconds' worth at the last piece's speed, at most double it, within
 * [256 KiB, chunkBytes].
 */
export function nextPieceSize(sentBytes: number, elapsedMs: number, chunkBytes: number): number {
	const wanted = elapsedMs > 0 ? (sentBytes * PIECE_TARGET_MS) / elapsedMs : Infinity;
	const size = Math.floor(Math.min(wanted, sentBytes * 2));
	return Math.min(chunkBytes, Math.max(MIN_PIECE_BYTES, size));
}

/** Wait before retrying after the given number of failures in a row (1 s, 2 s, 4 s, … up to 30 s). */
export function backoffDelay(failures: number): number {
	return Math.min(BACKOFF_START_MS * 2 ** Math.max(failures - 1, 0), BACKOFF_CAP_MS);
}

export type FailureAction = 'retry' | 'resync' | 'stop';

/** What to do after a piece failed; `status` is null when the request never got an answer. */
export function failureAction(status: number | null): FailureAction {
	if (status === null || status >= 500 || status === 408 || status === 429) return 'retry';
	if (status === 409) return 'resync';
	return 'stop';
}

/** Whether a file is the one an unfinished upload was started for. */
export function isSameUpload(existing: Pick<Import, 'filename' | 'size'>, file: File): boolean {
	return existing.filename === file.name && existing.size === file.size;
}

export type UploadDeps = {
	uploadPiece: (offset: number, piece: Blob, signal: AbortSignal) => Promise<ImportPiece>;
	/** The server's current import, for finding out where to continue after a 409. */
	fetchImport: () => Promise<Import | null>;
	describeError: (error: unknown) => { status: number | null; message: string };
	sleep: (ms: number, signal: AbortSignal) => Promise<void>;
	now: () => number;
};

export type UploadHooks = {
	onProgress: (received: number) => void;
	/** Called before waiting to retry a piece. */
	onRetry?: (failures: number, message: string) => void;
};

export type UploadResult =
	| { kind: 'finished' }
	| { kind: 'paused'; error: string }
	| { kind: 'stopped'; error: string }
	/** The server no longer waits for data; `import` is whatever it is now. */
	| { kind: 'superseded'; import: Import | null }
	| { kind: 'cancelled' };

/**
 * Send `file` to the server in pieces of at most `chunkBytes`, starting at `from`. A
 * network error or 5xx retries the same piece with growing waits and pauses
 * after MAX_FAILURES in a row; a 409 continues from what the server has.
 */
export async function runUpload(
	file: Blob,
	from: number,
	chunkBytes: number,
	deps: UploadDeps,
	hooks: UploadHooks,
	signal: AbortSignal
): Promise<UploadResult> {
	let received = from;
	let failures = 0;
	let pieceBytes = Math.min(chunkBytes, FIRST_PIECE_BYTES);

	while (received < file.size) {
		if (signal.aborted) return { kind: 'cancelled' };

		const offset = received;
		const piece = file.slice(offset, Math.min(offset + pieceBytes, file.size));
		let failure: string | null = null;

		try {
			const startedAt = deps.now();
			const result = await deps.uploadPiece(offset, piece, signal);
			if (result.received > offset) {
				received = result.received;
				failures = 0;
				pieceBytes = nextPieceSize(piece.size, deps.now() - startedAt, chunkBytes);
				hooks.onProgress(received);
				if (result.status !== 'uploading') return { kind: 'finished' };
				continue;
			}
			failure = 'The server did not accept the data.';
		} catch (error) {
			if (signal.aborted) return { kind: 'cancelled' };
			const { status, message } = deps.describeError(error);
			const action = failureAction(status);
			if (action === 'stop') {
				return { kind: 'stopped', error: status === 404 ? UPLOAD_DISCARDED : message };
			}
			failure = message;

			if (action === 'resync') {
				try {
					const current = await deps.fetchImport();
					if (current?.status !== 'uploading') return { kind: 'superseded', import: current };
					received = current.received;
					hooks.onProgress(received);
					// Only a changed position gets a fresh start; the same wrong offset again is a failure.
					if (received !== offset) {
						failures = 0;
						continue;
					}
				} catch (fetchError) {
					if (signal.aborted) return { kind: 'cancelled' };
					failure = deps.describeError(fetchError).message;
				}
			}
		}

		failures += 1;
		if (failures >= MAX_FAILURES) return { kind: 'paused', error: failure };
		hooks.onRetry?.(failures, failure);
		await deps.sleep(backoffDelay(failures), signal);
	}

	return { kind: 'finished' };
}

/** Resolves after `ms`, or right away when `signal` aborts. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) return resolve();
		const finish = () => {
			clearTimeout(timer);
			signal.removeEventListener('abort', finish);
			resolve();
		};
		const timer = setTimeout(finish, ms);
		signal.addEventListener('abort', finish);
	});
}
