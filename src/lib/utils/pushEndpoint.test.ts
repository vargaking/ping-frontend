import { describe, expect, it } from 'vitest';
import { isApplePushEndpoint } from './pushEndpoint';

describe('isApplePushEndpoint', () => {
	it('matches Apple hosts and their subdomains', () => {
		expect(isApplePushEndpoint('https://web.push.apple.com/QGx0')).toBe(true);
		expect(isApplePushEndpoint('https://push.apple.com/x')).toBe(true);
	});

	it('does not match other push services or lookalikes', () => {
		expect(isApplePushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(false);
		expect(isApplePushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(
			false
		);
		expect(isApplePushEndpoint('https://evilpush.apple.com.example.com/x')).toBe(false);
		expect(isApplePushEndpoint('https://notpush.apple.com/x')).toBe(false);
	});

	it('treats a malformed endpoint as not Apple', () => {
		expect(isApplePushEndpoint('not a url')).toBe(false);
	});
});
