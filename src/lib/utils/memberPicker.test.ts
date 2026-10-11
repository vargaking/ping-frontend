import { describe, expect, it } from 'vitest';
import { filterEntries, moveIndex, type PickerEntry } from './memberPicker';

const entries: PickerEntry[] = [
	{ value: null, label: 'Not matched' },
	{ value: 1, label: 'alice' },
	{ value: 2, label: 'Bob' },
	{ value: 3, label: 'Annabel' },
	{ value: 4, label: 'malice' }
];

describe('filterEntries', () => {
	it.each([
		['no query keeps the order', '', [null, 1, 2, 3, 4]],
		['a blank query is no query', '   ', [null, 1, 2, 3, 4]],
		['ignores case', 'BOB', [2]],
		['puts starts-with before contains', 'al', [1, 4]],
		['matches inside a name', 'nna', [3]],
		['trims the query', ' bo ', [2]],
		['searches the fixed options too', 'not', [null]],
		['finds nothing', 'zzz', []]
	])('%s', (_name, query, values) => {
		expect(filterEntries(entries, query).shown.map((e) => e.value)).toEqual(values);
	});

	it.each([
		[2, 'a', [1, 3], 2],
		[4, 'a', [1, 3, null, 4], 0],
		[1, '', [null], 4]
	])('shows %i of the matches for "%s" and counts the rest', (limit, query, values, hidden) => {
		const result = filterEntries(entries, query, limit);
		expect(result.shown.map((e) => e.value)).toEqual(values);
		expect(result.hidden).toBe(hidden);
	});
});

describe('moveIndex', () => {
	it.each([
		[0, 1, 3, 1],
		[2, 1, 3, 0],
		[0, -1, 3, 2],
		[1, -1, 3, 0],
		[0, 1, 1, 0],
		[0, 1, 0, -1],
		[-1, 1, 3, 0]
	])('from %i by %i of %i rows lands on %i', (index, step, length, expected) => {
		expect(moveIndex(index, step, length)).toBe(expected);
	});
});
