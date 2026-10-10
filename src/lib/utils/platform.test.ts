import { afterEach, describe, expect, it, vi } from 'vitest';
import { isApple } from './platform';

afterEach(() => vi.unstubAllGlobals());

describe('isApple', () => {
	it('is false without a navigator', () => {
		vi.stubGlobal('navigator', undefined);
		expect(isApple()).toBe(false);
	});

	it('prefers the client hints platform', () => {
		vi.stubGlobal('navigator', {
			userAgentData: { platform: 'macOS' },
			platform: 'Linux x86_64',
			userAgent: ''
		});
		expect(isApple()).toBe(true);
	});

	it('falls back to navigator.platform', () => {
		vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: '' });
		expect(isApple()).toBe(true);
	});

	it('is false on Windows and Linux', () => {
		vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows NT 10.0' });
		expect(isApple()).toBe(false);
		vi.stubGlobal('navigator', { userAgentData: { platform: 'Linux' }, userAgent: '' });
		expect(isApple()).toBe(false);
	});
});
