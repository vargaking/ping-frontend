import { describe, expect, it } from 'vitest';
import { screenShareSupported } from './screenShare';

describe('screenShareSupported', () => {
	it('is on for a desktop browser that can capture', () => {
		expect(screenShareSupported(true, null)).toBe(true);
	});

	it('is off when the browser cannot capture', () => {
		expect(screenShareSupported(false, null)).toBe(false);
	});

	it.each(['ios', 'android'] as const)(
		'is off on %s even when the browser exposes capture',
		(platform) => {
			expect(screenShareSupported(true, platform)).toBe(false);
		}
	);
});
