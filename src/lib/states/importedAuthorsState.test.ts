import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import type {
	AuthorsImport,
	ImportAuthorChange,
	ImportedAuthorsResponse
} from '$lib/types/serverImport.types';
import type { User } from '$lib/types/auth.types';

const requests = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));

vi.mock('$lib/requests/serverImport/getImportedAuthors', () => ({
	getImportedAuthors: requests.get
}));
vi.mock('$lib/requests/serverImport/saveImportAuthors', () => ({
	saveImportAuthors: requests.save
}));

import { usersState } from './usersState.svelte';
import { importedAuthorsState } from './importedAuthorsState.svelte';

const SERVER = 1;

function authorsImport(fields: Partial<AuthorsImport> = {}): AuthorsImport {
	return {
		id: 'imp-1',
		status: 'done',
		source: { platform: 'discord', server_name: 'Deducks' },
		progress: null,
		error: null,
		updated_at: '2026-01-01T00:00:00Z',
		authors: [{ id: '100', name: 'Alice', messages: 3, user_id: null }],
		...fields
	};
}

const change = (id: number): ImportAuthorChange => ({
	id,
	author_id: '100',
	author_name: 'Alice',
	actor_id: 7,
	from_user_id: null,
	to_user_id: 8,
	created_at: '2026-01-01T00:00:00Z'
});

const serve = (
	imp = authorsImport(),
	changes: ImportAuthorChange[] = []
): ImportedAuthorsResponse => ({ import: imp, changes });

const failure = (status: number) =>
	new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
		status,
		statusText: '',
		data: { detail: 'No finished import' },
		headers: {},
		config: { headers: new AxiosHeaders() }
	});

const logIn = (id: number | null) => {
	usersState.loggedInUser = id === null ? null : ({ id } as User);
};

beforeEach(() => {
	Object.values(requests).forEach((fn) => fn.mockReset());
	importedAuthorsState.reset();
	logIn(7);
});

describe('load', () => {
	it('stores the authors and changes', async () => {
		requests.get.mockResolvedValue(serve(authorsImport(), [change(1)]));
		await importedAuthorsState.load(SERVER);
		const entry = importedAuthorsState.of(SERVER);
		expect(entry.status).toBe('ready');
		expect(entry.import?.id).toBe('imp-1');
		expect(entry.changes).toEqual([change(1)]);
	});

	it.each([403, 404])('treats %s as nothing to show', async (status) => {
		requests.get.mockResolvedValueOnce(serve());
		await importedAuthorsState.load(SERVER);
		requests.get.mockRejectedValueOnce(failure(status));
		await importedAuthorsState.load(SERVER);
		const entry = importedAuthorsState.of(SERVER);
		expect(entry.status).toBe('missing');
		expect(entry.import).toBeNull();
		expect(entry.changes).toEqual([]);
	});

	it('keeps what is shown when a refresh fails, and reports a first failure', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		requests.get.mockRejectedValueOnce(failure(500));
		await importedAuthorsState.load(SERVER);
		expect(importedAuthorsState.of(SERVER).status).toBe('error');

		requests.get.mockResolvedValueOnce(serve());
		await importedAuthorsState.load(SERVER);
		requests.get.mockRejectedValueOnce(failure(500));
		await importedAuthorsState.load(SERVER);
		expect(importedAuthorsState.of(SERVER).status).toBe('ready');
	});

	it('hides another user’s data until they load their own', async () => {
		requests.get.mockResolvedValue(serve());
		await importedAuthorsState.load(SERVER);
		logIn(9);
		expect(importedAuthorsState.of(SERVER).import).toBeNull();
		expect(importedAuthorsState.of(SERVER).status).toBe('loading');
		importedAuthorsState.applyFrame(SERVER, authorsImport({ status: 'importing' }));
		expect(requests.get).toHaveBeenCalledTimes(1);
	});
});

describe('applyFrame', () => {
	const frame = (fields: Partial<AuthorsImport> = {}) => {
		const { id, status, progress, error, updated_at } = authorsImport(fields);
		return { id, status, progress, error, updated_at };
	};

	beforeEach(async () => {
		requests.get.mockResolvedValue(serve());
		await importedAuthorsState.load(SERVER);
		requests.get.mockClear();
	});

	it('merges progress without refetching while the status stays', () => {
		const progress = { phase: 'authors', done: 1, total: 4, label: null } as const;
		importedAuthorsState.applyFrame(
			SERVER,
			frame({ progress, updated_at: '2026-01-02T00:00:00Z' })
		);
		const entry = importedAuthorsState.of(SERVER);
		expect(entry.import?.progress).toEqual(progress);
		expect(entry.import?.authors).toHaveLength(1);
		expect(requests.get).not.toHaveBeenCalled();
	});

	it('refetches when the status changes', () => {
		importedAuthorsState.applyFrame(SERVER, frame({ status: 'importing' }));
		expect(importedAuthorsState.of(SERVER).import?.status).toBe('importing');
		expect(requests.get).toHaveBeenCalledTimes(1);
	});

	it('refetches for a different import', () => {
		importedAuthorsState.applyFrame(SERVER, frame({ id: 'imp-2' }));
		expect(requests.get).toHaveBeenCalledTimes(1);
	});

	it('ignores a server that was never loaded', () => {
		importedAuthorsState.applyFrame(2, frame({ status: 'importing' }));
		expect(requests.get).not.toHaveBeenCalled();
		expect(importedAuthorsState.of(2).import).toBeNull();
	});
});

describe('refresh', () => {
	it('reloads an entry of the current user', async () => {
		requests.get.mockResolvedValue(serve());
		await importedAuthorsState.load(SERVER);
		requests.get.mockClear();
		importedAuthorsState.refresh(SERVER);
		expect(requests.get).toHaveBeenCalledTimes(1);
	});

	it('leaves a server never loaded, or loaded by someone else, alone', async () => {
		importedAuthorsState.refresh(SERVER);
		requests.get.mockResolvedValue(serve());
		await importedAuthorsState.load(SERVER);
		requests.get.mockClear();
		logIn(9);
		importedAuthorsState.refresh(SERVER);
		importedAuthorsState.refresh(2);
		expect(requests.get).not.toHaveBeenCalled();
	});
});

describe('save', () => {
	it('sends the whole mapping, shows the answer and reloads the changes', async () => {
		requests.get.mockResolvedValueOnce(serve());
		await importedAuthorsState.load(SERVER);
		const answer = authorsImport({
			status: 'importing',
			authors: [{ id: '100', name: 'Alice', messages: 3, user_id: 8 }]
		});
		requests.save.mockResolvedValue(answer);
		requests.get.mockResolvedValueOnce(serve(answer, [change(1)]));

		await importedAuthorsState.save(SERVER, { '100': 8 });

		expect(requests.save).toHaveBeenCalledWith(SERVER, 'imp-1', { '100': 8 });
		const entry = importedAuthorsState.of(SERVER);
		expect(entry.import?.status).toBe('importing');
		expect(entry.changes).toEqual([change(1)]);
	});

	it('throws the server’s refusal and leaves the entry as it was', async () => {
		requests.get.mockResolvedValueOnce(serve());
		await importedAuthorsState.load(SERVER);
		requests.save.mockRejectedValue(failure(409));
		await expect(importedAuthorsState.save(SERVER, { '100': 8 })).rejects.toBeInstanceOf(
			AxiosError
		);
		expect(importedAuthorsState.of(SERVER).import?.status).toBe('done');
	});
});
