import { describe, expect, it } from 'vitest';
import type { WhatsNewEntry, WhatsNewSeen } from '$lib/types/whatsNew.types';
import { WHATS_NEW_ID, formatEntryDate, isUnseen, laterId } from './whatsNew';

function entry(id: string): WhatsNewEntry {
	return { id, date: id.slice(0, 10), title: 't', bullets: ['b'] };
}

const unmarked: WhatsNewSeen = { last_seen_id: null, created_on: '2026-10-05' };

describe('WHATS_NEW_ID', () => {
	it('accepts a date and a same-day suffix from 2 to 9', () => {
		expect(WHATS_NEW_ID.test('2026-10-10')).toBe(true);
		expect(WHATS_NEW_ID.test('2026-10-10-2')).toBe(true);
		expect(WHATS_NEW_ID.test('2026-10-10-9')).toBe(true);
	});

	it('rejects anything else', () => {
		for (const id of ['2026-10-10-1', '2026-10-10-10', '2026-10-1', '', '2026-10-10 ']) {
			expect(WHATS_NEW_ID.test(id)).toBe(false);
		}
	});
});

describe('isUnseen without a marker', () => {
	it('treats entries dated on the signup day as seen', () => {
		expect(isUnseen(entry('2026-10-05'), unmarked)).toBe(false);
		expect(isUnseen(entry('2026-10-05-2'), unmarked)).toBe(false);
		expect(isUnseen(entry('2026-10-04'), unmarked)).toBe(false);
	});

	it('treats entries from the day after as unseen', () => {
		expect(isUnseen(entry('2026-10-06'), unmarked)).toBe(true);
	});
});

describe('isUnseen with a marker', () => {
	const marked: WhatsNewSeen = { last_seen_id: '2026-10-10', created_on: '2026-10-05' };

	it('counts a same-day follow-up as unseen, and the day after too', () => {
		expect(isUnseen(entry('2026-10-10-2'), marked)).toBe(true);
		expect(isUnseen(entry('2026-10-11'), marked)).toBe(true);
	});

	it('counts the marker itself and older entries as seen', () => {
		expect(isUnseen(entry('2026-10-10'), marked)).toBe(false);
		expect(isUnseen(entry('2026-10-06'), marked)).toBe(false);
	});

	it('sees nothing unseen when the marker is newer than every entry', () => {
		const ahead: WhatsNewSeen = { last_seen_id: '2027-01-01', created_on: '2026-10-05' };
		for (const id of ['2026-10-10-2', '2026-10-10', '2026-10-01']) {
			expect(isUnseen(entry(id), ahead)).toBe(false);
		}
	});

	it('orders a follow-up between its day and the next day', () => {
		const afterFirst: WhatsNewSeen = { last_seen_id: '2026-10-10-2', created_on: '2026-10-05' };
		expect(isUnseen(entry('2026-10-10-3'), afterFirst)).toBe(true);
		expect(isUnseen(entry('2026-10-10-2'), afterFirst)).toBe(false);
		expect(isUnseen(entry('2026-10-10'), afterFirst)).toBe(false);
	});
});

describe('laterId', () => {
	it('handles nulls', () => {
		expect(laterId(null, null)).toBeNull();
		expect(laterId('2026-10-10', null)).toBe('2026-10-10');
		expect(laterId(null, '2026-10-10')).toBe('2026-10-10');
	});

	it('returns the larger id', () => {
		expect(laterId('2026-10-10', '2026-10-10-2')).toBe('2026-10-10-2');
		expect(laterId('2026-10-11', '2026-10-10-2')).toBe('2026-10-11');
	});
});

describe('formatEntryDate', () => {
	it('shows the entry day whatever the local time zone is', () => {
		const original = process.env.TZ;
		process.env.TZ = 'America/Los_Angeles';
		try {
			expect(formatEntryDate('2026-10-10')).toMatch(/10/);
			expect(formatEntryDate('2026-10-10')).not.toMatch(/\b9\b/);
			expect(formatEntryDate('2026-01-01')).toMatch(/2026/);
			expect(formatEntryDate('2026-01-01')).not.toMatch(/2025/);
		} finally {
			if (original === undefined) delete process.env.TZ;
			else process.env.TZ = original;
		}
	});
});
