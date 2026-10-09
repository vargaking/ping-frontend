import { describe, expect, it } from 'vitest';
import { staleNotifications, type ThreadReadView } from './notificationSweep';

const views: Record<string, ThreadReadView> = {
	'dm-1': { caughtUp: true, knows: (uuid) => uuid === 'known' },
	'dm-2': { caughtUp: false, knows: () => true }
};
const view = (tag: string) => views[tag];

const tags = (list: { tag: string }[]) => list.map((n) => n.tag);

describe('staleNotifications', () => {
	it('closes a caught-up thread whose message the page knows', async () => {
		const shown = [{ tag: 'dm-1', data: { messageUuid: 'known' } }];
		expect(await staleNotifications(shown, view)).toEqual(shown);
	});

	it('keeps a thread with something unread', async () => {
		const shown = [{ tag: 'dm-2', data: { messageUuid: 'known' } }];
		expect(await staleNotifications(shown, view)).toEqual([]);
	});

	it('keeps tags it does not track', async () => {
		const shown = [
			{ tag: 'zeta-generic' },
			{ tag: 'server-request-3' },
			{ tag: 'dm-99' },
			{ tag: 'test' }
		];
		expect(await staleNotifications(shown, view)).toEqual([]);
	});

	it('keeps a notification for a message it cannot place', async () => {
		const shown = [{ tag: 'dm-1', data: { messageUuid: 'new' } }];
		expect(await staleNotifications(shown, view)).toEqual([]);
	});

	it('closes an unplaced message that was shown before the sync started', async () => {
		const shown = [{ tag: 'dm-1', data: { messageUuid: 'new', shownAt: 100 } }];
		expect(tags(await staleNotifications(shown, view, 100))).toEqual(['dm-1']);
	});

	it('keeps an unplaced message that was shown after the sync started', async () => {
		const shown = [{ tag: 'dm-1', data: { messageUuid: 'new', shownAt: 101 } }];
		expect(await staleNotifications(shown, view, 100)).toEqual([]);
	});

	it('treats a notification without shownAt as old after a sync', async () => {
		const shown = [{ tag: 'dm-1', data: { messageUuid: 'new' } }];
		expect(tags(await staleNotifications(shown, view, 100))).toEqual(['dm-1']);
	});

	it('closes a caught-up thread whose notification has no message id', async () => {
		const shown = [{ tag: 'dm-1', data: { count: 2 } }, { tag: 'dm-1' }];
		expect(await staleNotifications(shown, view)).toEqual(shown);
	});

	it('waits for an async check of the local cache', async () => {
		const cached = { 'ch-4': { caughtUp: true, knows: async (uuid: string) => uuid === 'cached' } };
		const shown = [
			{ tag: 'ch-4', data: { messageUuid: 'cached' } },
			{ tag: 'ch-4', data: { messageUuid: 'other' } }
		];
		expect(await staleNotifications(shown, (tag) => cached[tag as 'ch-4'])).toEqual([shown[0]]);
	});
});
