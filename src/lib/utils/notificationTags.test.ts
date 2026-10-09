import { describe, expect, it } from 'vitest';
import { threadNotificationCount, withTag } from './notificationTags';

describe('withTag', () => {
	it('keeps only exact tag matches', () => {
		const shown = [
			{ tag: 'dm-1' },
			{ tag: 'dm-12' },
			{ tag: 'ch-1' },
			{ tag: 'dm-1', data: { count: 2 } }
		];
		expect(withTag(shown, 'dm-1')).toEqual([shown[0], shown[3]]);
	});
});

describe('threadNotificationCount', () => {
	it('shows the unread count of a DM, not the tray count', () => {
		const previous = [{ tag: 'dm-1', data: { count: 7 } }];
		expect(threadNotificationCount({ unread: 1, previous, messageUuid: 'a' }).count).toBe(1);
	});

	it('shows at least 1 for a DM', () => {
		expect(threadNotificationCount({ unread: 0, previous: [] }).count).toBe(1);
	});

	it('counts a mention up from the tray', () => {
		const previous = [{ tag: 'ch-1', data: { count: 2, messageUuid: 'a' } }];
		expect(threadNotificationCount({ previous, messageUuid: 'b' })).toEqual({
			count: 3,
			alreadyShown: false
		});
	});

	it('starts a mention at 1 with an empty tray', () => {
		expect(threadNotificationCount({ previous: [], messageUuid: 'a' }).count).toBe(1);
	});

	it('does not count a mention that is already shown again', () => {
		const previous = [{ tag: 'ch-1', data: { count: 2, messageUuid: 'a' } }];
		expect(threadNotificationCount({ previous, messageUuid: 'a' })).toEqual({
			count: 2,
			alreadyShown: true
		});
	});

	it('uses the highest count of several stacked notifications', () => {
		const previous = [
			{ tag: 'ch-1', data: { count: 1 } },
			{ tag: 'ch-1', data: { count: 4 } },
			{ tag: 'ch-1', data: { count: 2 } }
		];
		expect(threadNotificationCount({ previous, messageUuid: 'x' }).count).toBe(5);
	});

	it('flags a DM message that is already shown', () => {
		const previous = [{ tag: 'dm-1', data: { count: 1, messageUuid: 'a' } }];
		expect(threadNotificationCount({ unread: 1, previous, messageUuid: 'a' }).alreadyShown).toBe(
			true
		);
	});

	it('never reports already shown without a message id', () => {
		const previous = [{ tag: 'ch-1', data: { count: 1 } }];
		expect(threadNotificationCount({ previous }).alreadyShown).toBe(false);
	});
});
