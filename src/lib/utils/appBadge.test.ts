import { describe, expect, it } from 'vitest';
import { notificationBadgeCount } from './appBadge';

describe('notificationBadgeCount', () => {
	it('sums the counts of the notifications in the tray', () => {
		expect(
			notificationBadgeCount([
				{ tag: 'dm-1', data: { count: 3 } },
				{ tag: 'ch-2', data: { count: 1 } }
			])
		).toBe(4);
	});

	it('is zero for an empty tray', () => {
		expect(notificationBadgeCount([])).toBe(0);
	});

	it('skips notifications without a usable count', () => {
		expect(
			notificationBadgeCount([
				{ tag: 'a' },
				{ tag: 'b', data: { count: 'x' } },
				{ tag: 'c', data: { count: 2 } }
			])
		).toBe(2);
	});

	it('leaves out a notification that was just closed', () => {
		expect(
			notificationBadgeCount(
				[
					{ tag: 'dm-1', data: { count: 3 } },
					{ tag: 'ch-2', data: { count: 1 } }
				],
				'dm-1'
			)
		).toBe(1);
	});
});
