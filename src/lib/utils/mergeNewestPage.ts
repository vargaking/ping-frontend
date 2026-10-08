import type { MessageType } from '$lib/types/messages.types';

export type MergeOptions = {
	/** The page holds the whole thread (the server said there is nothing older). */
	complete: boolean;
	/** Ids that were loaded when the page was requested. */
	knownBefore: ReadonlySet<string>;
};

/**
 * Bring a loaded thread (oldest first) up to date with a freshly fetched newest page
 * (oldest first). Returns null when the page doesn't reach back to what is loaded, so
 * merging would leave a hole.
 */
export function mergeNewestPage(
	loaded: MessageType[],
	page: MessageType[],
	{ complete, knownBefore }: MergeOptions
): { messages: MessageType[]; keptOlder: boolean } | null {
	const tail = pendingTail(loaded, page, knownBefore);
	if (complete) return { messages: [...page, ...tail], keptOlder: false };

	const oldest = page[0];
	const at = oldest ? loaded.findIndex((m) => m.id === oldest.id) : -1;
	if (at === -1) return null;

	return { messages: [...loaded.slice(0, at), ...page, ...tail], keptOlder: at > 0 };
}

/** The newest page as the whole list, keeping what the page can't know about yet. */
export function replaceWithNewestPage(
	loaded: MessageType[],
	page: MessageType[],
	knownBefore: ReadonlySet<string>
): MessageType[] {
	return [...page, ...pendingTail(loaded, page, knownBefore)];
}

/** Live arrivals during the fetch, then our unsent messages, in their current order. */
function pendingTail(
	loaded: MessageType[],
	page: MessageType[],
	knownBefore: ReadonlySet<string>
): MessageType[] {
	const inPage = new Set(page.map((m) => m.id));
	const fresh = loaded.filter((m) => !inPage.has(m.id));
	return [
		...fresh.filter((m) => !m.status && !knownBefore.has(m.id)),
		...fresh.filter((m) => m.status)
	];
}
