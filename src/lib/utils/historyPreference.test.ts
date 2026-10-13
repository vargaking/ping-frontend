import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	browserSavesData,
	downloadMode,
	readDownloadPreference,
	writeDownloadPreference
} from './historyPreference';

function stubLocalStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value)
	});
	return values;
}

afterEach(() => vi.unstubAllGlobals());

describe('download preference', () => {
	it.each([
		['absent', {}, null],
		['on', { 'history:download': 'on' }, true],
		['off', { 'history:download': 'off' }, false],
		['anything else', { 'history:download': 'maybe' }, null]
	])('reads %s', (_, stored, expected) => {
		stubLocalStorage(stored);

		expect(readDownloadPreference()).toBe(expected);
	});

	it.each([
		[true, 'on'],
		[false, 'off']
	])('writes %s as %s', (value, stored) => {
		const values = stubLocalStorage();

		writeDownloadPreference(value);

		expect(values.get('history:download')).toBe(stored);
	});

	it('reads as unset and ignores a write when storage throws', () => {
		const fail = () => {
			throw new Error('blocked');
		};
		vi.stubGlobal('localStorage', { getItem: fail, setItem: fail });

		expect(readDownloadPreference()).toBeNull();
		expect(() => writeDownloadPreference(false)).not.toThrow();
	});

	it('reads as unset without any storage', () => {
		expect(readDownloadPreference()).toBeNull();
	});
});

describe('downloadMode', () => {
	it.each([
		[null, false, 'full'],
		[null, true, 'catchUp'],
		[true, false, 'full'],
		[true, true, 'full'],
		[false, false, 'off'],
		[false, true, 'off']
	] as const)('with preference %s and data saver %s is %s', (preference, savesData, mode) => {
		expect(downloadMode(preference, savesData)).toBe(mode);
	});
});

describe('browserSavesData', () => {
	it.each([
		[{ connection: { saveData: true } }, true],
		[{ connection: { saveData: false } }, false],
		[{}, false]
	])('reads %j', (navigatorStub, expected) => {
		vi.stubGlobal('navigator', navigatorStub);

		expect(browserSavesData()).toBe(expected);
	});
});
