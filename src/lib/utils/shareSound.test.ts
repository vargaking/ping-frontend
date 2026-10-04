import { describe, expect, it } from 'vitest';
import {
	detectBrowser,
	detectPlatform,
	soundOption,
	soundResult,
	type SoundEnv
} from './shareSound';

const UA = {
	chromeWin:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	edgeWin:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
	chromeMac:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	chromeLinux:
		'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
	safariMac:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
	opera:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0',
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
	android:
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
};

const chrome = { kind: 'chromium', name: 'Chrome' } as const;

function env(
	platform: SoundEnv['platform'],
	browser: SoundEnv['browser'] = chrome,
	desktop: SoundEnv['desktop'] = null
): SoundEnv {
	return { browser, platform, desktop };
}

describe('detectBrowser', () => {
	it.each([
		['chromeWin', 'chromium', 'Chrome'],
		['edgeWin', 'chromium', 'Edge'],
		['opera', 'chromium', 'Opera'],
		['chromeMac', 'chromium', 'Chrome'],
		['chromeLinux', 'chromium', 'Chrome'],
		['firefox', 'firefox', 'Firefox'],
		['safariMac', 'safari', 'Safari']
	] as const)('%s', (key, kind, name) => {
		expect(detectBrowser(UA[key])).toEqual({ kind, name });
	});

	it('falls back for unknown agents', () => {
		expect(detectBrowser('curl/8.0')).toEqual({ kind: 'other', name: 'Your browser' });
	});
});

describe('detectPlatform', () => {
	it.each([
		['chromeWin', 'windows'],
		['edgeWin', 'windows'],
		['chromeMac', 'mac'],
		['safariMac', 'mac'],
		['chromeLinux', 'linux'],
		['firefox', 'linux'],
		['iphone', 'other'],
		['android', 'other']
	] as const)('%s', (key, platform) => {
		expect(detectPlatform(UA[key])).toBe(platform);
	});

	it('is other for unknown agents', () => {
		expect(detectPlatform('curl/8.0')).toBe('other');
	});
});

describe('soundOption', () => {
	it('desktop that can capture sound', () => {
		expect(soundOption(env('windows', chrome, { canShareAudio: true }), 'monitor')).toEqual({
			available: true,
			note: 'Includes everything this PC plays, not only what you pick.'
		});
	});

	it.each([
		['linux', "Sound isn't available on Linux yet."],
		['mac', "Sound isn't available on macOS yet."],
		['other', "Sound isn't available on this system yet."]
	] as const)('desktop without sound on %s', (platform, note) => {
		expect(soundOption(env(platform, chrome, { canShareAudio: false }), 'monitor')).toEqual({
			available: false,
			note
		});
	});

	it('desktop wins over browser checks', () => {
		const firefoxLike = { kind: 'firefox', name: 'Firefox' } as const;
		expect(
			soundOption(env('windows', firefoxLike, { canShareAudio: true }), 'window').available
		).toBe(true);
	});

	it('firefox and safari cannot share sound', () => {
		expect(soundOption(env('linux', { kind: 'firefox', name: 'Firefox' }), 'browser')).toEqual({
			available: false,
			note: "Firefox can't share sound."
		});
		expect(soundOption(env('mac', { kind: 'safari', name: 'Safari' }), 'monitor')).toEqual({
			available: false,
			note: "Safari can't share sound."
		});
	});

	it('chromium tab', () => {
		expect(soundOption(env('linux'), 'browser')).toEqual({
			available: true,
			note: `Plays the tab's sound. Leave "Also share tab audio" ticked in Chrome's picker.`
		});
	});

	it('chromium window', () => {
		expect(soundOption(env('windows', { kind: 'chromium', name: 'Edge' }), 'window')).toEqual({
			available: false,
			note: 'Edge only shares sound from a tab or the entire screen.'
		});
	});

	it('chromium entire screen on Windows', () => {
		expect(soundOption(env('windows'), 'monitor')).toEqual({
			available: true,
			note: `Shares everything this PC plays. Leave "Also share system audio" ticked in Chrome's picker.`
		});
	});

	it.each(['mac', 'linux', 'other'] as const)('chromium entire screen on %s', (platform) => {
		expect(soundOption(env(platform), 'monitor')).toEqual({
			available: false,
			note: "Chrome only shares the entire screen's sound on Windows. Pick a tab to share its sound."
		});
	});

	it('other browsers may not work', () => {
		expect(soundOption(env('windows', { kind: 'other', name: 'Your browser' }), 'monitor')).toEqual(
			{
				available: true,
				note: 'Your browser may not share sound.'
			}
		);
	});
});

describe('soundResult', () => {
	const base = { audioTracks: 0, requested: true } as const;

	it('audio present wins, even on a window', () => {
		expect(soundResult(env('linux'), { ...base, audioTracks: 1, surface: 'window' })).toEqual({
			on: true,
			text: 'Sound on'
		});
	});

	it('sound turned off wins over the picked surface', () => {
		expect(
			soundResult(env('linux', chrome), { ...base, requested: false, surface: 'window' })
		).toEqual({ on: false, text: 'No sound: you turned sound off' });
	});

	it('a device that never shares sound says so, even with the switch off', () => {
		expect(
			soundResult(env('linux', { kind: 'firefox', name: 'Firefox' }), { ...base, requested: false })
				.text
		).toBe("No sound: Firefox can't share sound");
		expect(
			soundResult(env('linux', chrome, { canShareAudio: false }), { ...base, requested: false })
				.text
		).toBe("No sound: sound isn't available on Linux yet");
	});

	it.each([
		['linux', "No sound: sound isn't available on Linux yet"],
		['mac', "No sound: sound isn't available on macOS yet"],
		['other', "No sound: sound isn't available on this system yet"]
	] as const)('desktop without sound on %s', (platform, text) => {
		expect(soundResult(env(platform, chrome, { canShareAudio: false }), base)).toEqual({
			on: false,
			text
		});
	});

	it('desktop on Windows without a track', () => {
		expect(soundResult(env('windows', chrome, { canShareAudio: true }), base)).toEqual({
			on: false,
			text: "No sound: the PC's sound couldn't be captured"
		});
	});

	it('firefox and safari', () => {
		expect(soundResult(env('linux', { kind: 'firefox', name: 'Firefox' }), base).text).toBe(
			"No sound: Firefox can't share sound"
		);
		expect(
			soundResult(env('mac', { kind: 'safari', name: 'Safari' }), { ...base, surface: 'monitor' })
				.text
		).toBe("No sound: Safari can't share sound");
	});

	it('chrome window', () => {
		expect(soundResult(env('windows'), { ...base, surface: 'window' }).text).toBe(
			'No sound: Chrome only shares sound from a tab or the entire screen'
		);
	});

	it('chrome entire screen off Windows', () => {
		expect(soundResult(env('mac'), { ...base, surface: 'monitor' }).text).toBe(
			"No sound: Chrome only shares the entire screen's sound on Windows"
		);
	});

	it('chrome tab with the box unticked', () => {
		expect(soundResult(env('linux'), { ...base, surface: 'browser' }).text).toBe(
			"No sound: the box wasn't ticked in the browser's picker"
		);
	});

	it('chrome entire screen on Windows with the box unticked', () => {
		expect(soundResult(env('windows'), { ...base, surface: 'monitor' }).text).toBe(
			"No sound: the box wasn't ticked in the browser's picker"
		);
	});

	it('unknown surface', () => {
		expect(soundResult(env('linux'), base)).toEqual({ on: false, text: 'No sound' });
	});
});
