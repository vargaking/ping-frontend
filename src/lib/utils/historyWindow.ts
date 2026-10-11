import { normalizeError } from '$lib/requests/errors';
import type { MessageType } from '$lib/types/messages.types';
import type { MessagePage, PageQuery } from '$lib/requests/channels/getChannelMessages';
import { timestampMs } from './messageContent';

/** A window page (oldest first), then our unsent messages from the list it replaces. */
export function withUnsentTail(page: MessageType[], loaded: MessageType[]): MessageType[] {
	const inPage = new Set(page.map((m) => m.id));
	return [...page, ...loaded.filter((m) => m.status && !inPage.has(m.id))];
}

/**
 * The window extended towards the present: the messages up to its server edge, the newer page's
 * messages that weren't loaded, then what is not part of the window's server pages (what arrived
 * live meanwhile and our sent messages carried along) by time, and our unsent messages last.
 */
export function appendNewerPage(
	loaded: MessageType[],
	newer: MessageType[],
	arrived: MessageType[],
	serverEdgeId: string | null
): MessageType[] {
	const edge = loaded.findIndex((m) => m.id === serverEdgeId);
	const windowed = edge >= 0 ? loaded.slice(0, edge + 1) : loaded.filter((m) => !m.status);
	const carried = edge >= 0 ? loaded.slice(edge + 1) : loaded.filter((m) => m.status);

	const known = new Set(windowed.map((m) => m.id));
	const fresh = newer.filter((m) => !known.has(m.id));
	for (const m of fresh) known.add(m.id);
	const late: MessageType[] = [];
	for (const m of [...carried.filter((m) => !m.status), ...arrived]) {
		if (known.has(m.id)) continue;
		known.add(m.id);
		late.push(m);
	}
	late.sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp));
	const unsent = carried.filter((m) => m.status && !known.has(m.id));
	return [...windowed, ...fresh, ...late, ...unsent];
}

/** Opens a thread with the window around `target` when there is one, else with the newest page. */
export async function fetchOpeningPage(
	fetchPage: (query?: PageQuery) => Promise<MessagePage>,
	target: string | null
): Promise<MessagePage> {
	if (!target) return fetchPage();
	try {
		return await fetchPage({ around: target });
	} catch (e) {
		// The server turned the target down (gone, malformed); the jump reports it, the thread opens.
		if (normalizeError(e).status == null) throw e;
		return fetchPage();
	}
}

export type JumpFailure = 'gone' | 'offline' | 'failed';

export function jumpFailure(error: unknown): JumpFailure {
	const { status } = normalizeError(error);
	if (status === 404) return 'gone';
	return status == null ? 'offline' : 'failed';
}

export const JUMP_FAILURE_TOAST: Record<JumpFailure, string> = {
	gone: 'That message no longer exists.',
	offline: "Couldn't open that message while offline.",
	failed: "Couldn't load that message."
};
