import { expect, it } from 'vitest';
import { shouldDismissSheet } from './sheetSwipe';

it.each([
	[97, 1000, true],
	[96, 1000, false],
	[30, 40, true],
	[30, 100, false],
	[24, 10, false],
	[10, 1, false],
	[-200, 100, false],
	[40, 0, true]
])('a drag of %i px over %i ms dismisses: %s', (dy, ms, expected) => {
	expect(shouldDismissSheet(dy, ms)).toBe(expected);
});
