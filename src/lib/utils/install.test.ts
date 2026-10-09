import { describe, expect, it } from 'vitest';
import { installHint, isStandalone, mobilePlatform, blockedHelp, type InstallEnv } from './install';

const UA = {
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
	ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
	ipadAsMac:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
	android:
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
	chromeWin:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

describe('mobilePlatform', () => {
	it('recognises iPhone and iPad', () => {
		expect(mobilePlatform(UA.iphone, 5)).toBe('ios');
		expect(mobilePlatform(UA.ipad, 5)).toBe('ios');
	});

	it('recognises an iPad that reports as a Mac by its touch screen', () => {
		expect(mobilePlatform(UA.ipadAsMac, 5)).toBe('ios');
		expect(mobilePlatform(UA.ipadAsMac, 0)).toBeNull();
	});

	it('recognises Android and leaves desktops alone', () => {
		expect(mobilePlatform(UA.android, 5)).toBe('android');
		expect(mobilePlatform(UA.chromeWin, 0)).toBeNull();
	});
});

describe('isStandalone', () => {
	it('accepts either signal', () => {
		expect(isStandalone(true, undefined)).toBe(true);
		expect(isStandalone(false, true)).toBe(true);
		expect(isStandalone(false, false)).toBe(false);
		expect(isStandalone(false, undefined)).toBe(false);
	});
});

describe('installHint', () => {
	const phone = (platform: InstallEnv['platform']): InstallEnv => ({
		platform,
		standalone: false,
		desktopShell: false
	});

	it('gives iOS instructions without waiting for a prompt', () => {
		expect(installHint(phone('ios'), false)).toBe('add-to-home-screen');
	});

	it('shows nothing on Android until the browser offers the prompt', () => {
		expect(installHint(phone('android'), false)).toBeNull();
		expect(installHint(phone('android'), true)).toBe('install-prompt');
	});

	it('shows nothing on desktop browsers', () => {
		expect(installHint(phone(null), true)).toBeNull();
	});

	it('shows nothing once installed or in the desktop app', () => {
		expect(installHint({ ...phone('ios'), standalone: true }, false)).toBeNull();
		expect(installHint({ ...phone('android'), standalone: true }, true)).toBeNull();
		expect(installHint({ ...phone('ios'), desktopShell: true }, false)).toBeNull();
	});
});

describe('blockedHelp', () => {
	it('points the installed app at the phone settings', () => {
		expect(blockedHelp('ios', true)).toContain('Open Settings');
		expect(blockedHelp('android', true)).toContain("phone's notification settings");
	});

	it('points a browser tab at the site settings', () => {
		expect(blockedHelp('android', false)).toContain("browser's site settings");
		expect(blockedHelp('ios', false)).toContain("browser's site settings");
		expect(blockedHelp(null, false)).toContain('lock icon');
	});
});
