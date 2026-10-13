import { afterEach, describe, expect, it } from 'vitest';
import { localDay, localMonth, quickDates, weekStartDay, type WeekDay } from './quickDates';

const inserts = (now: Date, firstDay: WeekDay) => quickDates(now, firstDay).map((q) => q.insert);

describe('quickDates', () => {
	it('lists today, yesterday, this week and this month, in that order', () => {
		expect(quickDates(new Date(2026, 9, 14), 1).map((q) => [q.key, q.label])).toEqual([
			['today', 'Today'],
			['yesterday', 'Yesterday'],
			['week', 'This week'],
			['month', 'This month']
		]);
	});

	// 14 Oct 2026 is a Wednesday, 11 Oct a Sunday, 12 Oct a Monday.
	it.each<[string, Date, WeekDay, string]>([
		['Wednesday, Monday start', new Date(2026, 9, 14), 1, 'after:2026-10-12'],
		['Wednesday, Sunday start', new Date(2026, 9, 14), 7, 'after:2026-10-11'],
		['Sunday, Sunday start', new Date(2026, 9, 11), 7, 'after:2026-10-11'],
		['Sunday, Monday start', new Date(2026, 9, 11), 1, 'after:2026-10-05'],
		['Monday, Monday start', new Date(2026, 9, 12), 1, 'after:2026-10-12'],
		['Monday, Sunday start', new Date(2026, 9, 12), 7, 'after:2026-10-11'],
		['a week that began in August', new Date(2026, 8, 2), 1, 'after:2026-08-31']
	])('this week on %s is %s', (_name, now, firstDay, expected) => {
		expect(inserts(now, firstDay)[2]).toBe(expected);
	});

	it.each<[string, Date, string[]]>([
		[
			'the first of January',
			new Date(2027, 0, 1),
			['during:2027-01-01', 'during:2026-12-31', 'after:2026-12-28', 'during:2027-01']
		],
		[
			'December',
			new Date(2026, 11, 31),
			['during:2026-12-31', 'during:2026-12-30', 'after:2026-12-28', 'during:2026-12']
		],
		[
			'the day after a leap day',
			new Date(2028, 2, 1),
			['during:2028-03-01', 'during:2028-02-29', 'after:2028-02-28', 'during:2028-03']
		]
	])('on %s', (_name, now, expected) => {
		expect(inserts(now, 1)).toEqual(expected);
	});

	describe('in a time zone ahead of UTC', () => {
		const original = process.env.TZ;
		afterEach(() => {
			if (original === undefined) delete process.env.TZ;
			else process.env.TZ = original;
		});

		it.each([
			['just after midnight', 0, 30],
			['just before midnight', 23, 30]
		])('uses the local day %s', (_name, hour, minute) => {
			process.env.TZ = 'Pacific/Auckland';
			const now = new Date(2026, 9, 14, hour, minute);
			expect(inserts(now, 1)[0]).toBe('during:2026-10-14');
		});
	});
});

describe('localDay and localMonth', () => {
	it('pad and use the local calendar', () => {
		const d = new Date(2026, 0, 5, 23, 59);
		expect(localDay(d)).toBe('2026-01-05');
		expect(localMonth(d)).toBe('2026-01');
	});
});

describe('weekStartDay', () => {
	it.each<[string | undefined, WeekDay]>([
		['en-US', 7],
		['hu-HU', 1],
		['not a locale', 1],
		[undefined, 1]
	])('for %j is %i', (locale, expected) => {
		expect(weekStartDay(locale)).toBe(expected);
	});
});
