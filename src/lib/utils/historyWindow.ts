import { normalizeError } from '$lib/requests/errors';
import type { MessageType } from '$lib/types/messages.types';
import { timestampMs } from './messageContent';

/** A window page (oldest first), then our unsent messages from the list it replaces. */
export function withUnsentTail(page: MessageType[], loaded: MessageType[]): MessageType[] {
	const inPage = new Set(page.map((m) => m.id));
	return [...page, ...loaded.filter((m) => m.status && !inPage.has(m.id))];
}

/**
 * The window extended towards the present: its server messages, the newer page's messages that
 * weren't loaded, what arrived live meanwhile by time, then our unsent messages last.
 */
export function appendNewerPage(
	loaded: MessageType[],
	newer: MessageType[],
	arrived: MessageType[]
): MessageType[] {
	const known = new Set(loaded.map((m) => m.id));
	const fresh = newer.filter((m) => !known.has(m.id));
	for (const m of fresh) known.add(m.id);
	const late = arrived
		.filter((m) => !known.has(m.id))
		.sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp));
	return [...loaded.filter((m) => !m.status), ...fresh, ...late, ...loaded.filter((m) => m.status)];
}

/** The newest message the server has, which newer pages continue from. */
export function newerAnchor(loaded: MessageType[]): string | null {
	return loaded.findLast((m) => !m.status)?.id ?? null;
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
