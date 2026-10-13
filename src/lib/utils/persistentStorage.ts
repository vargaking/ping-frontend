import { localHistoryAvailable } from '$lib/utils/db';

const ASKED_KEY = 'history:persistAsked';
const ASK_AGAIN_MS = 30 * 24 * 60 * 60 * 1000;

/** Null where nothing is kept on the device, so the storage API has nothing to say about history. */
function manager(): StorageManager | null {
	if (!localHistoryAvailable || typeof navigator === 'undefined') return null;
	return navigator.storage ?? null;
}

function askedRecently(now: number): boolean {
	try {
		const asked = Number(localStorage.getItem(ASKED_KEY));
		return asked > 0 && now - asked < ASK_AGAIN_MS;
	} catch {
		return false;
	}
}

function rememberAsking(now: number): void {
	try {
		localStorage.setItem(ASKED_KEY, String(now));
	} catch {
		// Without storage the browser may ask again on the next visit.
	}
}

/** Null when the browser can't say. */
export async function isStoragePersisted(): Promise<boolean | null> {
	const storage = manager();
	if (!storage?.persisted) return null;
	try {
		return await storage.persisted();
	} catch {
		return null;
	}
}

/**
 * Asks the browser not to evict the device's data. Firefox shows a prompt, so a refused
 * or unanswered ask is not repeated for a month. Null when asking isn't possible.
 */
export async function requestPersistence(now = Date.now()): Promise<boolean | null> {
	const storage = manager();
	if (!storage?.persist || !storage.persisted) return null;
	try {
		if (await storage.persisted()) return true;
		if (askedRecently(now)) return false;
		rememberAsking(now);
		return await storage.persist();
	} catch {
		return null;
	}
}

/** Bytes the whole origin uses, not only message history. Null when unknown or nothing is kept. */
export async function storageUsage(): Promise<number | null> {
	const storage = manager();
	if (!storage?.estimate) return null;
	try {
		return (await storage.estimate()).usage ?? null;
	} catch {
		return null;
	}
}
