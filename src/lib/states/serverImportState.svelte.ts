import { createServerImport } from '$lib/requests/serverImport/createServerImport';
import { discardServerImport } from '$lib/requests/serverImport/discardServerImport';
import { getServerImport } from '$lib/requests/serverImport/getServerImport';
import { saveImportAuthors } from '$lib/requests/serverImport/saveImportAuthors';
import { startServerImport } from '$lib/requests/serverImport/startServerImport';
import { uploadImportPiece } from '$lib/requests/serverImport/uploadImportPiece';
import { getErrorMessage, normalizeError } from '$lib/requests/errors';
import { formatBytes } from '$lib/requests/attachments/uploadAttachment';
import type { AuthorMapping, Import, ImportLimits } from '$lib/types/serverImport.types';
import { fileProblem, isWorking, mappingPayload, mergeImportFrame } from '$lib/utils/serverImport';
import {
	abortableSleep,
	isSameUpload,
	runUpload,
	type UploadResult
} from '$lib/utils/serverImportUpload';

const POLL_MS = 15_000;

export type UploadView = {
	filename: string;
	size: number;
	received: number;
	uploading: boolean;
	paused: boolean;
	/** The last failed piece's message while retrying, or why the upload paused. */
	error: string | null;
};

export type ServerImportEntry = {
	limits: ImportLimits | null;
	import: Import | null;
	loadStatus: 'loading' | 'ready' | 'error';
	loadError: string | null;
	/** Set while this tab holds the file and is sending it, or has paused. */
	upload: UploadView | null;
	/** Why the last upload attempt failed outright. */
	error: string | null;
};

const EMPTY: ServerImportEntry = {
	limits: null,
	import: null,
	loadStatus: 'loading',
	loadError: null,
	upload: null,
	error: null
};

type Session = { controller: AbortController; importId: string; file: File };

const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
	event.preventDefault();
	event.returnValue = '';
};

/**
 * Each server's import as the settings tab shows it. This lives outside the
 * tab so an upload keeps going after the settings are closed.
 */
class ServerImportState {
	private entries: Record<number, ServerImportEntry> = $state({});
	private sessions = new Map<number, Session>();
	private loadSeq = new Map<number, number>();
	private polls = new Map<number, ReturnType<typeof setInterval>>();
	private guarding = false;

	of(serverId: number): ServerImportEntry {
		return this.entries[serverId] ?? EMPTY;
	}

	/** The reactive entry; the assignment expression would hand back the plain object instead. */
	private ensure(serverId: number): ServerImportEntry {
		if (!this.entries[serverId]) this.entries[serverId] = { ...EMPTY };
		return this.entries[serverId];
	}

	/** Fetch the server's import. Quiet once something is on screen, so it doesn't flash. */
	async load(serverId: number): Promise<void> {
		const entry = this.ensure(serverId);
		const seq = (this.loadSeq.get(serverId) ?? 0) + 1;
		this.loadSeq.set(serverId, seq);
		const hadData = entry.limits !== null;
		if (!hadData) {
			entry.loadStatus = 'loading';
			entry.loadError = null;
		}
		try {
			const response = await getServerImport(serverId);
			if (this.loadSeq.get(serverId) !== seq) return;
			const { limits } = response;
			if (
				entry.limits?.max_bytes !== limits.max_bytes ||
				entry.limits?.chunk_bytes !== limits.chunk_bytes
			) {
				entry.limits = limits;
			}
			entry.loadStatus = 'ready';
			entry.loadError = null;
			this.store(serverId, response.import);
		} catch (e) {
			if (this.loadSeq.get(serverId) !== seq) return;
			if (hadData) {
				console.warn('Failed to refresh the import', e);
				return;
			}
			entry.loadStatus = 'error';
			entry.loadError = getErrorMessage(e);
		}
	}

	/** Refetch after a socket frame, for a server whose import tab has been opened. */
	refresh(serverId: number): void {
		if (this.entries[serverId]) void this.load(serverId);
	}

	/** Apply a server_import_updated frame. */
	applyFrame(serverId: number, incoming: Import): void {
		const entry = this.entries[serverId];
		if (!entry) return;
		const { merged, refetch } = mergeImportFrame(entry.import, incoming);
		this.store(serverId, merged);
		if (refetch) void this.load(serverId);
	}

	private store(serverId: number, value: Import | null) {
		const entry = this.ensure(serverId);
		entry.import = value;
		this.syncPolling(serverId);
	}

	/** An answer to our own request is newer than any fetch still on its way. */
	private storeAnswer(serverId: number, value: Import | null) {
		this.loadSeq.set(serverId, (this.loadSeq.get(serverId) ?? 0) + 1);
		this.store(serverId, value);
	}

	private syncPolling(serverId: number) {
		const working = isWorking(this.entries[serverId]?.import?.status);
		const timer = this.polls.get(serverId);
		if (working && timer === undefined) {
			this.polls.set(
				serverId,
				setInterval(() => void this.load(serverId), POLL_MS)
			);
		} else if (!working && timer !== undefined) {
			clearInterval(timer);
			this.polls.delete(serverId);
		}
	}

	/** Upload `file` as a new import; the server drops any unfinished one. */
	async upload(serverId: number, file: File): Promise<void> {
		const entry = this.ensure(serverId);
		if (this.sessions.has(serverId) || !entry.limits) return;
		const problem = fileProblem(file, entry.limits, formatBytes);
		if (problem) {
			entry.error = problem;
			return;
		}
		entry.error = null;
		let created: Import;
		try {
			created = await createServerImport(serverId, file.name, file.size);
		} catch (e) {
			entry.error = getErrorMessage(e);
			return;
		}
		this.storeAnswer(serverId, created);
		await this.send(serverId, file, created, 0);
	}

	/** Continue an interrupted upload; refuses a file other than the one it was started with. */
	async resumeWith(serverId: number, file: File): Promise<void> {
		const entry = this.ensure(serverId);
		const current = entry.import;
		if (this.sessions.has(serverId)) return;
		if (current?.status !== 'uploading' || !isSameUpload(current, file)) {
			entry.error = "That isn't the file this upload was started with.";
			return;
		}
		entry.error = null;
		await this.send(serverId, file, current, current.received);
	}

	/** Continue a paused upload from where it stopped. */
	async resume(serverId: number): Promise<void> {
		const entry = this.entries[serverId];
		const session = this.sessions.get(serverId);
		if (!entry?.upload?.paused || !entry.import || !session) return;
		await this.send(serverId, session.file, entry.import, entry.upload.received);
	}

	/** Stop sending and remove the unfinished import. */
	async cancel(serverId: number): Promise<void> {
		const session = this.sessions.get(serverId);
		if (!session) return;
		session.controller.abort();
		this.endSession(serverId);
		try {
			await discardServerImport(serverId, session.importId);
		} catch (e) {
			this.ensure(serverId).error = getErrorMessage(e);
		}
		await this.load(serverId);
	}

	private async send(serverId: number, file: File, target: Import, from: number) {
		const entry = this.ensure(serverId);
		const limits = entry.limits;
		if (!limits) return;

		const controller = new AbortController();
		this.sessions.set(serverId, { controller, importId: target.id, file });
		const view: UploadView = {
			filename: file.name,
			size: file.size,
			received: from,
			uploading: true,
			paused: false,
			error: null
		};
		entry.upload = view;
		this.syncUnloadGuard();

		const own = () => this.sessions.get(serverId)?.controller === controller;
		const result = await runUpload(
			file,
			from,
			limits.chunk_bytes,
			{
				uploadPiece: (offset, piece, signal) =>
					uploadImportPiece(serverId, target.id, offset, piece, signal),
				fetchImport: async () => (await getServerImport(serverId)).import,
				describeError: normalizeError,
				sleep: abortableSleep
			},
			{
				onProgress: (received) => {
					if (!own() || !entry.upload) return;
					entry.upload.received = received;
					entry.upload.error = null;
				},
				onRetry: (_failures, message) => {
					if (own() && entry.upload) entry.upload.error = message;
				}
			},
			controller.signal
		);
		if (!own()) return;
		await this.finishUpload(serverId, target, result);
	}

	private async finishUpload(serverId: number, target: Import, result: UploadResult) {
		const entry = this.ensure(serverId);
		if (result.kind === 'paused') {
			if (entry.upload) {
				entry.upload.uploading = false;
				entry.upload.paused = true;
				entry.upload.error = result.error;
			}
			this.syncUnloadGuard();
			return;
		}
		if (result.kind === 'finished') {
			// The server unpacks from here; polling picks it up if the refetch fails.
			const current = entry.import;
			if (current?.id === target.id && current.status === 'uploading') {
				this.store(serverId, {
					...current,
					status: 'unpacking',
					received: current.size,
					progress: { phase: 'unpacking', done: 0, total: current.size, label: null }
				});
			}
			void this.load(serverId);
		} else if (result.kind === 'superseded') {
			this.storeAnswer(serverId, result.import);
		} else {
			if (result.kind === 'stopped') entry.error = result.error;
			await this.load(serverId);
		}
		this.endSession(serverId);
	}

	private endSession(serverId: number) {
		this.sessions.delete(serverId);
		const entry = this.entries[serverId];
		if (entry) entry.upload = null;
		this.syncUnloadGuard();
	}

	private syncUnloadGuard() {
		const sending = Object.values(this.entries).some((entry) => entry.upload?.uploading);
		if (typeof window === 'undefined') return;
		if (sending && !this.guarding) {
			window.addEventListener('beforeunload', warnBeforeLeaving);
			this.guarding = true;
		} else if (!sending && this.guarding) {
			window.removeEventListener('beforeunload', warnBeforeLeaving);
			this.guarding = false;
		}
	}

	/** Save the author mapping; a finished import then hands the messages over. */
	async saveAuthors(serverId: number, mapping: AuthorMapping): Promise<Import> {
		const current = this.requireImport(serverId);
		const saved = await saveImportAuthors(
			serverId,
			current.id,
			mappingPayload(current.authors, mapping)
		);
		this.storeAnswer(serverId, saved);
		return saved;
	}

	/** Run the import for the plan the owner has reviewed. */
	async start(serverId: number): Promise<Import> {
		const started = await startServerImport(serverId, this.requireImport(serverId).id);
		this.storeAnswer(serverId, started);
		return started;
	}

	/** Remove the import's files; whatever was imported stays. */
	async discard(serverId: number): Promise<void> {
		await discardServerImport(serverId, this.requireImport(serverId).id);
		this.storeAnswer(serverId, null);
		// An older finished import may be the latest one again.
		await this.load(serverId);
	}

	private requireImport(serverId: number): Import {
		const current = this.entries[serverId]?.import;
		if (!current) throw new Error('There is no import to work on.');
		return current;
	}

	/** Dismiss an upload error once it has been read. */
	clearError(serverId: number) {
		const entry = this.entries[serverId];
		if (entry) entry.error = null;
	}

	forget(serverId: number) {
		this.sessions.get(serverId)?.controller.abort();
		this.sessions.delete(serverId);
		const timer = this.polls.get(serverId);
		if (timer !== undefined) clearInterval(timer);
		this.polls.delete(serverId);
		this.loadSeq.delete(serverId);
		delete this.entries[serverId];
		this.syncUnloadGuard();
	}

	reset() {
		for (const serverId of Object.keys(this.entries).map(Number)) this.forget(serverId);
	}
}

export const serverImportState = new ServerImportState();
