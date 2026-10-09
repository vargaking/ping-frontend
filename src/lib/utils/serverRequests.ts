import type { ServerRequest, ServerRequestStatus } from '$lib/types/serverRequest.types';

export const STATUS_LABELS: Record<ServerRequestStatus, string> = {
	pending: 'Pending',
	approved: 'Approved',
	declined: 'Declined',
	withdrawn: 'Withdrawn'
};

/** Replace the request with the same id, or put a new one first (history is newest first). */
export function upsertRequest(history: ServerRequest[], request: ServerRequest): ServerRequest[] {
	return history.some((r) => r.id === request.id)
		? history.map((r) => (r.id === request.id ? request : r))
		: [request, ...history];
}

/** Everything in the history except the request that is shown as the current one. */
export function pastRequests(
	history: ServerRequest[],
	current: ServerRequest | null
): ServerRequest[] {
	return current ? history.filter((r) => r.id !== current.id) : history;
}

const sentFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

export function sentOn(iso: string): string {
	return sentFormat.format(new Date(iso));
}
