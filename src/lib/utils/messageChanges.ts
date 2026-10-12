import { MAX_IDS_PER_REQUEST } from '$lib/requests/messages/getMessagesByIds';
import type { MessageChange, MessageChangesPage } from '$lib/requests/messages/getMessageChanges';
import type { MessageType } from '$lib/types/messages.types';
import { normalizeError } from '$lib/requests/errors';
import { db, localHistoryAvailable } from '$lib/utils/db';

const CURSOR_KEY = 'historyChangesCursor:';

export function readCursor(userId: number): string | null {
	try {
		return localStorage.getItem(CURSOR_KEY + userId);
	} catch {
		return null;
	}
}

export function writeCursor(userId: number, cursor: string): void {
	try {
		localStorage.setItem(CURSOR_KEY + userId, cursor);
	} catch {
		// Without storage every run just asks for a fresh cursor.
	}
}

export function removeCursor(userId: number): void {
	try {
		localStorage.removeItem(CURSOR_KEY + userId);
	} catch {
		// Nothing was stored.
	}
}

/** Forgets every downloaded message, so the next catch-up fetches everything again. */
export async function resetLocalHistory(): Promise<void> {
	await db.transaction('rw', db.messages, db.posts, db.threadSync, async () => {
		await Promise.all([db.messages.clear(), db.posts.clear(), db.threadSync.clear()]);
	});
}

export type ChangesSource = {
	page(since: string | undefined): Promise<MessageChangesPage>;
	byIds(ids: string[]): Promise<MessageType[]>;
};

function chunks<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/** An id that was edited and then deleted is a delete. */
function settle(changes: MessageChange[]): { edited: string[]; deleted: string[] } {
	const kinds = new Map<string, MessageChange['kind']>();
	for (const change of changes) {
		if (kinds.get(change.id) !== 'deleted') kinds.set(change.id, change.kind);
	}
	const ids = [...kinds.keys()];
	return {
		edited: ids.filter((id) => kinds.get(id) === 'edited'),
		deleted: ids.filter((id) => kinds.get(id) === 'deleted')
	};
}

async function localIds(ids: string[]): Promise<string[]> {
	const rows = await db.messages.bulkGet(ids);
	return rows.flatMap((row) => (row ? [row.id] : []));
}

async function applyPage(changes: MessageChange[], source: ChangesSource): Promise<void> {
	// Loaded here because socketState reaches this module through importRefresh and historySyncState.
	const { socketState } = await import('$lib/states/socketState.svelte');
	const { edited, deleted } = settle(changes);

	const drop = async (ids: string[]) => {
		for (const id of await localIds(ids)) await socketState.handleMessageDeleted({ id });
	};

	await drop(deleted);
	for (const chunk of chunks(await localIds(edited), MAX_IDS_PER_REQUEST)) {
		const found = new Map((await source.byIds(chunk)).map((m) => [m.id, m]));
		for (const id of chunk) {
			const message = found.get(id);
			if (message) await socketState.handleMessageUpdated(message);
		}
		await drop(chunk.filter((id) => !found.has(id)));
	}
}

/**
 * Brings the local copy in line with edits and deletes made while this device was away.
 * The stored cursor moves only after a whole page is applied; any failure throws and
 * leaves it where it was.
 */
export async function applyMessageChanges(userId: number, source: ChangesSource): Promise<void> {
	if (!localHistoryAvailable) return;

	let since = readCursor(userId) ?? undefined;
	if (since === undefined) {
		writeCursor(userId, (await source.page(undefined)).cursor);
		return;
	}

	while (true) {
		const page: MessageChangesPage = await source.page(since).catch((error) => {
			// A cursor the server can't read would fail every run; the next run takes a fresh one.
			if (normalizeError(error).status === 400) removeCursor(userId);
			throw error;
		});
		if (page.reset) {
			await resetLocalHistory();
			writeCursor(userId, page.cursor);
			return;
		}
		await applyPage(page.changes, source);
		if (page.has_more && page.cursor === since)
			throw new Error('The changes feed is not advancing');
		writeCursor(userId, page.cursor);
		if (!page.has_more) return;
		since = page.cursor;
	}
}
