import { describe, expect, it } from 'vitest';
import { shouldCheck, updateNoticeDetail } from './updateNotice';

describe('shouldCheck', () => {
	it('checks the first time', () => {
		expect(shouldCheck(1000, null, 30_000)).toBe(true);
	});

	it('skips a check inside the gap', () => {
		expect(shouldCheck(30_999, 1000, 30_000)).toBe(false);
	});

	it('checks once the gap has passed', () => {
		expect(shouldCheck(31_000, 1000, 30_000)).toBe(true);
	});
});

describe('updateNoticeDetail', () => {
	const none = { offline: false, inCall: false, unsentAttachments: false };

	it('has nothing to add when nothing is at risk', () => {
		expect(updateNoticeDetail(none)).toBeNull();
	});

	it('warns about the call', () => {
		expect(updateNoticeDetail({ ...none, inCall: true })).toBe(
			'Reloading will drop your voice call.'
		);
	});

	it('warns about unsent attachments', () => {
		expect(updateNoticeDetail({ ...none, unsentAttachments: true })).toBe(
			"Attachments you haven't sent will be lost."
		);
	});

	it('warns about both', () => {
		expect(updateNoticeDetail({ ...none, inCall: true, unsentAttachments: true })).toBe(
			"Reloading will drop your voice call and the attachments you haven't sent."
		);
	});

	it('tells an offline user to wait, ahead of other warnings', () => {
		expect(updateNoticeDetail({ offline: true, inCall: true, unsentAttachments: true })).toBe(
			"You're offline. Reload once you're back online."
		);
	});
});
