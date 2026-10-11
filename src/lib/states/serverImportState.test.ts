import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Import, ImportsResponse, Plan } from '$lib/types/serverImport.types';

const requests = vi.hoisted(() => ({
	get: vi.fn(),
	create: vi.fn(),
	piece: vi.fn(),
	authors: vi.fn(),
	start: vi.fn(),
	discard: vi.fn()
}));

vi.mock('$lib/requests/serverImport/getServerImport', () => ({ getServerImport: requests.get }));
vi.mock('$lib/requests/serverImport/createServerImport', () => ({
	createServerImport: requests.create
}));
vi.mock('$lib/requests/serverImport/uploadImportPiece', () => ({
	uploadImportPiece: requests.piece
}));
vi.mock('$lib/requests/serverImport/saveImportAuthors', () => ({
	saveImportAuthors: requests.authors
}));
vi.mock('$lib/requests/serverImport/startServerImport', () => ({
	startServerImport: requests.start
}));
vi.mock('$lib/requests/serverImport/discardServerImport', () => ({
	discardServerImport: requests.discard
}));
vi.mock('$lib/requests/attachments/uploadAttachment', () => ({
	formatBytes: (n: number) => `${n} B`
}));

import { serverImportState } from './serverImportState.svelte';

const SERVER = 1;
const LIMITS = { max_bytes: 1000, chunk_bytes: 10 };

const plan = { totals: { messages: 3 } } as Plan;

function importWith(fields: Partial<Import> = {}): Import {
	return {
		id: 'imp-1',
		status: 'ready',
		filename: 'bundle.zip',
		size: 25,
		received: 25,
		source: { platform: 'discord', server_name: 'Deducks' },
		progress: null,
		failed_step: null,
		error: null,
		plan,
		result: null,
		authors: [{ id: '100', name: 'Alice', messages: 3, user_id: null }],
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		...fields
	};
}

const serve = (value: Import | null): ImportsResponse => ({ limits: LIMITS, import: value });
const zip = (size = 25, name = 'bundle.zip') => new File([new Uint8Array(size)], name);

let listeners: Set<unknown>;

beforeEach(() => {
	Object.values(requests).forEach((fn) => fn.mockReset());
	listeners = new Set();
	vi.stubGlobal('window', {
		addEventListener: (_type: string, fn: unknown) => listeners.add(fn),
		removeEventListener: (_type: string, fn: unknown) => listeners.delete(fn)
	});
});

afterEach(() => {
	serverImportState.reset();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('load', () => {
	it('stores the limits and the import', async () => {
		requests.get.mockResolvedValue(serve(importWith()));

		await serverImportState.load(SERVER);

		const entry = serverImportState.of(SERVER);
		expect(entry.loadStatus).toBe('ready');
		expect(entry.limits).toEqual(LIMITS);
		expect(entry.import?.id).toBe('imp-1');
	});

	it('reports a failed first load and keeps what it had after a later one fails', async () => {
		requests.get.mockRejectedValueOnce(new Error('offline'));
		await serverImportState.load(SERVER);
		expect(serverImportState.of(SERVER)).toMatchObject({
			loadStatus: 'error',
			loadError: 'offline'
		});

		requests.get.mockResolvedValueOnce(serve(importWith()));
		await serverImportState.load(SERVER);
		requests.get.mockRejectedValueOnce(new Error('offline'));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		await serverImportState.load(SERVER);

		expect(serverImportState.of(SERVER)).toMatchObject({ loadStatus: 'ready', loadError: null });
		expect(serverImportState.of(SERVER).import?.id).toBe('imp-1');
	});
});

describe('applyFrame', () => {
	const running = importWith({ status: 'importing', result: plan, plan });

	beforeEach(async () => {
		requests.get.mockResolvedValue(serve(running));
		await serverImportState.load(SERVER);
		requests.get.mockClear();
	});

	it('keeps the plan, result and authors and does not refetch while the status holds', () => {
		serverImportState.applyFrame(
			SERVER,
			importWith({
				status: 'importing',
				progress: { phase: 'importing', done: 2, total: 3, label: 'general' },
				plan: null,
				result: null,
				authors: []
			})
		);

		const stored = serverImportState.of(SERVER).import;
		expect(stored?.progress?.done).toBe(2);
		expect(stored?.plan).toBe(plan);
		expect(stored?.result).toBe(plan);
		expect(stored?.authors).toHaveLength(1);
		expect(requests.get).not.toHaveBeenCalled();
	});

	it('refetches when the status changed', async () => {
		const done = importWith({ status: 'done', result: plan });
		requests.get.mockResolvedValue(serve(done));

		serverImportState.applyFrame(
			SERVER,
			importWith({ status: 'done', plan: null, result: null, authors: [] })
		);

		expect(requests.get).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(serverImportState.of(SERVER).import?.status).toBe('done'));
	});

	it('ignores frames for a server whose tab was never opened', () => {
		serverImportState.applyFrame(99, importWith());
		expect(serverImportState.of(99).import).toBeNull();
		expect(requests.get).not.toHaveBeenCalled();
	});
});

describe('polling', () => {
	it('refetches every 15 seconds while the server works and stops after', async () => {
		vi.useFakeTimers();
		requests.get.mockResolvedValue(serve(importWith({ status: 'importing' })));
		await serverImportState.load(SERVER);
		requests.get.mockClear();

		await vi.advanceTimersByTimeAsync(14_999);
		expect(requests.get).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(requests.get).toHaveBeenCalledTimes(1);

		requests.get.mockResolvedValue(serve(importWith({ status: 'done' })));
		await vi.advanceTimersByTimeAsync(15_000);
		requests.get.mockClear();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(requests.get).not.toHaveBeenCalled();
	});
});

describe('upload', () => {
	const created = importWith({ status: 'uploading', received: 0, plan: null, authors: [] });

	beforeEach(async () => {
		requests.get.mockResolvedValue(serve(null));
		await serverImportState.load(SERVER);
	});

	it('creates the import, sends the pieces and warns before leaving only while sending', async () => {
		requests.create.mockResolvedValue(created);
		const sentOffsets: number[] = [];
		let warnedWhileSending = 0;
		requests.piece.mockImplementation(async (_s, _i, offset: number) => {
			sentOffsets.push(offset);
			warnedWhileSending = Math.max(warnedWhileSending, listeners.size);
			return offset + 10 >= 25
				? { received: 25, status: 'unpacking' }
				: { received: offset + 10, status: 'uploading' };
		});
		requests.get.mockResolvedValue(serve(importWith({ status: 'unpacking', plan: null })));

		await serverImportState.upload(SERVER, zip());

		expect(requests.create).toHaveBeenCalledWith(SERVER, 'bundle.zip', 25);
		expect(sentOffsets).toEqual([0, 10, 20]);
		expect(warnedWhileSending).toBe(1);
		expect(listeners.size).toBe(0);
		expect(serverImportState.of(SERVER).upload).toBeNull();
		expect(serverImportState.of(SERVER).import?.status).toBe('unpacking');
	});

	it('refuses a file that fails the checks before any request', async () => {
		await serverImportState.upload(SERVER, zip(2000));
		expect(serverImportState.of(SERVER).error).toContain('larger than the limit');

		await serverImportState.upload(SERVER, zip(5, 'notes.txt'));
		expect(serverImportState.of(SERVER).error).toContain('.zip');
		expect(requests.create).not.toHaveBeenCalled();
	});

	it('shows the server error when the import cannot be created', async () => {
		requests.create.mockRejectedValue(new Error('An import is already running'));

		await serverImportState.upload(SERVER, zip());

		expect(serverImportState.of(SERVER).error).toBe('An import is already running');
		expect(serverImportState.of(SERVER).upload).toBeNull();
	});

	it('stops with the server message on a 413', async () => {
		requests.create.mockResolvedValue(created);
		requests.get.mockResolvedValue(serve(created));
		const { AxiosError } = await import('axios');
		requests.piece.mockRejectedValue(
			new AxiosError('x', '413', undefined, undefined, {
				status: 413,
				data: { detail: 'The file is larger than the limit (1 KB)' }
			} as never)
		);

		await serverImportState.upload(SERVER, zip());

		expect(serverImportState.of(SERVER).error).toBe('The file is larger than the limit (1 KB)');
		expect(serverImportState.of(SERVER).upload).toBeNull();
		expect(requests.piece).toHaveBeenCalledTimes(1);
	});
});

describe('continuing an interrupted upload', () => {
	const interrupted = importWith({ status: 'uploading', received: 10, plan: null, authors: [] });

	beforeEach(async () => {
		requests.get.mockResolvedValue(serve(interrupted));
		await serverImportState.load(SERVER);
	});

	it('starts from what the server received when the name and size match', async () => {
		const offsets: number[] = [];
		requests.piece.mockImplementation(async (_s, _i, offset: number) => {
			offsets.push(offset);
			return offset + 10 >= 25
				? { received: 25, status: 'unpacking' }
				: { received: offset + 10, status: 'uploading' };
		});

		await serverImportState.resumeWith(SERVER, zip());

		expect(requests.create).not.toHaveBeenCalled();
		expect(offsets).toEqual([10, 20]);
	});

	it('refuses a different file', async () => {
		await serverImportState.resumeWith(SERVER, zip(30));
		await serverImportState.resumeWith(SERVER, zip(25, 'other.zip'));

		expect(requests.piece).not.toHaveBeenCalled();
		expect(serverImportState.of(SERVER).error).toBe(
			"That isn't the file this upload was started with."
		);
	});
});

describe('cancel', () => {
	it('aborts the piece in flight and removes the import', async () => {
		requests.get.mockResolvedValue(serve(null));
		await serverImportState.load(SERVER);
		requests.create.mockResolvedValue(
			importWith({ status: 'uploading', received: 0, plan: null, authors: [] })
		);
		let signal: AbortSignal | undefined;
		requests.piece.mockImplementation(
			(_s, _i, _offset, _piece, given: AbortSignal) =>
				new Promise((_resolve, reject) => {
					signal = given;
					given.addEventListener('abort', () => reject(new Error('canceled')));
				})
		);
		requests.discard.mockResolvedValue(undefined);

		const uploading = serverImportState.upload(SERVER, zip());
		await vi.waitFor(() => expect(signal).toBeDefined());
		expect(serverImportState.of(SERVER).upload?.uploading).toBe(true);

		requests.get.mockResolvedValue(serve(null));
		await serverImportState.cancel(SERVER);
		await uploading;

		expect(signal?.aborted).toBe(true);
		expect(requests.discard).toHaveBeenCalledWith(SERVER, 'imp-1');
		expect(serverImportState.of(SERVER).upload).toBeNull();
		expect(serverImportState.of(SERVER).import).toBeNull();
		expect(listeners.size).toBe(0);
	});
});

describe('pausing', () => {
	it('exposes the error after repeated failures and continues on resume', async () => {
		vi.useFakeTimers();
		requests.get.mockResolvedValue(serve(null));
		await serverImportState.load(SERVER);
		requests.create.mockResolvedValue(
			importWith({ status: 'uploading', received: 0, plan: null, authors: [] })
		);
		const { AxiosError } = await import('axios');
		const unavailable = () =>
			new AxiosError('x', '503', undefined, undefined, {
				status: 503,
				data: { detail: 'Unavailable' }
			} as never);
		requests.piece.mockRejectedValue(unavailable());

		const uploading = serverImportState.upload(SERVER, zip(5));
		await vi.advanceTimersByTimeAsync(200_000);
		await uploading;

		expect(requests.piece).toHaveBeenCalledTimes(8);
		expect(serverImportState.of(SERVER).upload).toMatchObject({
			paused: true,
			uploading: false,
			received: 0,
			size: 5,
			error: 'Unavailable'
		});
		expect(listeners.size).toBe(0);

		requests.piece.mockReset();
		requests.piece.mockResolvedValue({ received: 5, status: 'unpacking' });
		requests.get.mockResolvedValue(serve(importWith({ status: 'unpacking', plan: null })));
		await serverImportState.resume(SERVER);

		expect(requests.piece).toHaveBeenCalledTimes(1);
		expect(serverImportState.of(SERVER).upload).toBeNull();
	});
});

describe('answers to requests', () => {
	beforeEach(async () => {
		requests.get.mockResolvedValue(serve(importWith()));
		await serverImportState.load(SERVER);
	});

	it('saves only the matched authors and stores the returned import', async () => {
		const saved = importWith({
			authors: [{ id: '100', name: 'Alice', messages: 3, user_id: 4 }]
		});
		requests.authors.mockResolvedValue(saved);

		await serverImportState.saveAuthors(SERVER, { '100': 4 });

		expect(requests.authors).toHaveBeenCalledWith(SERVER, 'imp-1', { '100': 4 });
		expect(serverImportState.of(SERVER).import?.authors[0].user_id).toBe(4);
	});

	it('stores the started import and begins polling', async () => {
		vi.useFakeTimers();
		requests.start.mockResolvedValue(importWith({ status: 'importing' }));

		await serverImportState.start(SERVER);
		expect(serverImportState.of(SERVER).import?.status).toBe('importing');

		requests.get.mockClear();
		await vi.advanceTimersByTimeAsync(15_000);
		expect(requests.get).toHaveBeenCalledTimes(1);
	});

	it('sends the private channel picks when given', async () => {
		requests.start.mockResolvedValue(importWith({ status: 'importing' }));

		await serverImportState.start(SERVER, { '103': 'only_me' });

		expect(requests.start).toHaveBeenCalledWith(SERVER, 'imp-1', { '103': 'only_me' });
	});

	it('sends no picks when there are none, so the stored ones are reused', async () => {
		requests.start.mockResolvedValue(importWith({ status: 'importing' }));

		await serverImportState.start(SERVER);

		expect(requests.start.mock.calls[0].slice(2)).toEqual([undefined]);
	});

	it('shows the previous import again after a discard', async () => {
		requests.discard.mockResolvedValue(undefined);
		requests.get.mockResolvedValue(serve(importWith({ id: 'older', status: 'done' })));

		await serverImportState.discard(SERVER);

		expect(requests.discard).toHaveBeenCalledWith(SERVER, 'imp-1');
		expect(serverImportState.of(SERVER).import?.id).toBe('older');
	});
});
