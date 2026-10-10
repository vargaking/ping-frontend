import type { JSONContent } from '@tiptap/core';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type ReloadDraft = { threadKey: string; content: JSONContent; savedAt: number };

export const RELOAD_DRAFT_MAX_AGE_MS = 5 * 60_000;
const KEY = 'reloadDraft';

function parseDraft(raw: string): ReloadDraft | null {
	try {
		const draft = JSON.parse(raw);
		const valid =
			typeof draft?.threadKey === 'string' &&
			typeof draft.savedAt === 'number' &&
			typeof draft.content === 'object' &&
			draft.content !== null;
		return valid ? draft : null;
	} catch {
		return null;
	}
}

/** Null clears any saved draft. Never throws. */
export function saveReloadDraft(storage: StorageLike | null, draft: ReloadDraft | null): void {
	try {
		if (draft) storage?.setItem(KEY, JSON.stringify(draft));
		else storage?.removeItem(KEY);
	} catch {
		// Storage unavailable: the text is simply not restored.
	}
}

/**
 * The saved draft for this thread, once: a match is removed. A draft for another thread is
 * left alone unless it has expired. Expired or malformed entries are removed and yield null.
 * Never throws.
 */
export function takeReloadDraft(
	storage: StorageLike | null,
	threadKey: string,
	now: number
): JSONContent | null {
	try {
		const raw = storage?.getItem(KEY);
		if (!storage || !raw) return null;
		const draft = parseDraft(raw);
		const expired = draft != null && now - draft.savedAt >= RELOAD_DRAFT_MAX_AGE_MS;
		if (!draft || expired) {
			storage.removeItem(KEY);
			return null;
		}
		if (draft.threadKey !== threadKey) return null;
		storage.removeItem(KEY);
		return draft.content;
	} catch {
		return null;
	}
}
