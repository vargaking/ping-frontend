import { getImportedAuthors } from '$lib/requests/serverImport/getImportedAuthors';
import { saveImportAuthors } from '$lib/requests/serverImport/saveImportAuthors';
import { normalizeError } from '$lib/requests/errors';
import type {
	AuthorMapping,
	AuthorsImport,
	HolderImportFrame,
	Import,
	ImportAuthorChange
} from '$lib/types/serverImport.types';
import { mappingPayload } from '$lib/utils/serverImport';
import { usersState } from './usersState.svelte';

export type ImportedAuthorsEntry = {
	/** Whose view this is; another logged-in user starts from nothing. */
	userId: number | null;
	/** "missing" means no finished import, or no right to see it. */
	status: 'loading' | 'ready' | 'missing' | 'error';
	import: AuthorsImport | null;
	changes: ImportAuthorChange[];
};

const EMPTY: ImportedAuthorsEntry = { userId: null, status: 'loading', import: null, changes: [] };

/**
 * The finished import's authors and change log for members who may match authors but
 * don't own the server, who can't read the Import tab's data.
 */
class ImportedAuthorsState {
	private entries: Record<number, ImportedAuthorsEntry> = $state({});
	private loadSeq = new Map<number, number>();

	/** Reads only, so a deriving caller never writes state; entries of another user are ignored. */
	of(serverId: number): ImportedAuthorsEntry {
		const entry = this.entries[serverId];
		return entry && entry.userId === usersState.loggedInUser?.id ? entry : EMPTY;
	}

	/** The reactive entry for the logged-in user, started over if it was someone else's. */
	private ensure(serverId: number, userId: number): ImportedAuthorsEntry {
		if (this.entries[serverId]?.userId !== userId) {
			this.entries[serverId] = { ...EMPTY, userId };
		}
		return this.entries[serverId];
	}

	async load(serverId: number): Promise<void> {
		const userId = usersState.loggedInUser?.id;
		if (userId == null) return;
		const entry = this.ensure(serverId, userId);
		const seq = (this.loadSeq.get(serverId) ?? 0) + 1;
		this.loadSeq.set(serverId, seq);
		const hadData = entry.status === 'ready';
		if (!hadData) entry.status = 'loading';
		try {
			const response = await getImportedAuthors(serverId);
			if (this.loadSeq.get(serverId) !== seq) return;
			entry.import = response.import;
			entry.changes = response.changes;
			entry.status = 'ready';
		} catch (e) {
			if (this.loadSeq.get(serverId) !== seq) return;
			const status = normalizeError(e).status;
			if (status === 403 || status === 404) {
				entry.import = null;
				entry.changes = [];
				entry.status = 'missing';
			} else if (!hadData) {
				entry.status = 'error';
			} else {
				console.warn('Failed to refresh the imported authors', e);
			}
		}
	}

	/** Fold a server_import_updated frame into what we show; a changed status refetches. */
	applyFrame(serverId: number, frame: Import | HolderImportFrame): void {
		const entry = this.entries[serverId];
		if (!entry || entry.userId !== usersState.loggedInUser?.id || !entry.import) return;
		if (frame.id !== entry.import.id) {
			void this.load(serverId);
			return;
		}
		const statusChanged = frame.status !== entry.import.status;
		entry.import = {
			...entry.import,
			status: frame.status,
			progress: frame.progress,
			error: frame.error,
			updated_at: frame.updated_at
		};
		if (statusChanged) void this.load(serverId);
	}

	/** Send the mapping and show the answer; the error is thrown so the caller can show its text. */
	async save(serverId: number, mapping: AuthorMapping): Promise<void> {
		const userId = usersState.loggedInUser?.id;
		const current = this.entries[serverId];
		if (userId == null || current?.userId !== userId || !current.import) {
			throw new Error('The imported authors are not loaded.');
		}
		const saved = await saveImportAuthors(
			serverId,
			current.import.id,
			mappingPayload(current.import.authors, mapping)
		);
		if (this.entries[serverId]?.userId !== userId) return;
		this.loadSeq.set(serverId, (this.loadSeq.get(serverId) ?? 0) + 1);
		this.entries[serverId].import = {
			id: saved.id,
			status: saved.status,
			progress: saved.progress,
			error: saved.error,
			updated_at: saved.updated_at,
			source: saved.source,
			authors: saved.authors
		};
		await this.load(serverId);
	}

	reset(): void {
		this.entries = {};
		this.loadSeq.clear();
	}
}

export const importedAuthorsState = new ImportedAuthorsState();
