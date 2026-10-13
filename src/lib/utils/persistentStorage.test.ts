import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isStoragePersisted, requestPersistence, storageUsage } from './persistentStorage';

const device = vi.hoisted(() => ({ available: true }));

vi.mock('$lib/utils/db', () => ({
	get localHistoryAvailable() {
		return device.available;
	}
}));

const DAY = 24 * 60 * 60 * 1000;

let values: Map<string, string>;

function stubStorage(manager: Partial<StorageManager> | undefined) {
	vi.stubGlobal('navigator', { storage: manager });
}

beforeEach(() => {
	device.available = true;
	values = new Map();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value)
	});
});

afterEach(() => vi.unstubAllGlobals());

describe('requestPersistence', () => {
	it('asks once and remembers when', async () => {
		const persist = vi.fn().mockResolvedValue(true);
		stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist });

		expect(await requestPersistence(1000)).toBe(true);

		expect(persist).toHaveBeenCalledTimes(1);
		expect(values.get('history:persistAsked')).toBe('1000');
	});

	it('does not ask again soon after, even if the browser said no', async () => {
		const persist = vi.fn().mockResolvedValue(false);
		stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist });
		await requestPersistence(1000);

		expect(await requestPersistence(1000 + 29 * DAY)).toBe(false);

		expect(persist).toHaveBeenCalledTimes(1);
	});

	it('asks again after a month', async () => {
		const persist = vi.fn().mockResolvedValue(true);
		stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist });
		await requestPersistence(1000);

		await requestPersistence(1000 + 31 * DAY);

		expect(persist).toHaveBeenCalledTimes(2);
	});

	it('does not ask when the storage is already protected', async () => {
		const persist = vi.fn();
		stubStorage({ persisted: vi.fn().mockResolvedValue(true), persist });

		expect(await requestPersistence()).toBe(true);

		expect(persist).not.toHaveBeenCalled();
		expect(values.size).toBe(0);
	});

	it.each([
		['without the storage api', undefined],
		['without persist', { persisted: vi.fn() }],
		['without persisted', { persist: vi.fn() }]
	])('does nothing %s', async (_, manager) => {
		stubStorage(manager);

		expect(await requestPersistence()).toBeNull();
		expect(values.size).toBe(0);
	});

	it('does nothing where nothing is kept on the device', async () => {
		device.available = false;
		const persist = vi.fn();
		stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist });

		expect(await requestPersistence()).toBeNull();

		expect(persist).not.toHaveBeenCalled();
	});

	it('reports nothing when the browser throws', async () => {
		stubStorage({ persisted: vi.fn().mockRejectedValue(new Error('denied')), persist: vi.fn() });

		expect(await requestPersistence()).toBeNull();
	});
});

describe('isStoragePersisted', () => {
	it.each([true, false])('reports %s', async (answer) => {
		stubStorage({ persisted: vi.fn().mockResolvedValue(answer) });

		expect(await isStoragePersisted()).toBe(answer);
	});

	it('reports null when the browser cannot say', async () => {
		stubStorage(undefined);

		expect(await isStoragePersisted()).toBeNull();
	});
});

describe('storageUsage', () => {
	it('reads the bytes in use', async () => {
		stubStorage({ estimate: vi.fn().mockResolvedValue({ usage: 4096, quota: 1e9 }) });

		expect(await storageUsage()).toBe(4096);
	});

	it('never asks where nothing is kept on the device', async () => {
		device.available = false;
		const estimate = vi.fn().mockResolvedValue({ usage: 4096 });
		stubStorage({ estimate });

		expect(await storageUsage()).toBeNull();
		expect(estimate).not.toHaveBeenCalled();
	});

	it.each([
		['the estimate has no usage', { estimate: vi.fn().mockResolvedValue({}) }],
		['the estimate fails', { estimate: vi.fn().mockRejectedValue(new Error('no')) }],
		['there is no estimate', {}]
	])('is null when %s', async (_, manager) => {
		stubStorage(manager);

		expect(await storageUsage()).toBeNull();
	});
});
