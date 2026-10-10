import type { WhatsNewEntry, WhatsNewSeen } from '$lib/types/whatsNew.types';

export const WHATS_NEW_ID = /^[0-9]{4}-[0-9]{2}-[0-9]{2}(-[2-9])?$/;

/** Ids sort in time order as plain strings. */
export function isUnseen(entry: WhatsNewEntry, seen: WhatsNewSeen): boolean {
	return seen.last_seen_id != null ? entry.id > seen.last_seen_id : entry.date > seen.created_on;
}

export function laterId(a: string | null, b: string | null): string | null {
	if (a == null) return b;
	if (b == null) return a;
	return a >= b ? a : b;
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});

export function formatEntryDate(date: string): string {
	return dateFormat.format(new Date(`${date}T00:00:00Z`));
}
