export const DOWNLOAD_PREFERENCE_KEY = 'history:download';

/** `catchUp` is the data-saver mode: the newest page of each conversation, no walk to the oldest. */
export type DownloadMode = 'full' | 'catchUp' | 'off';

/** True or false when the person chose, null when they never did. */
export function readDownloadPreference(): boolean | null {
	try {
		const raw = localStorage.getItem(DOWNLOAD_PREFERENCE_KEY);
		if (raw === 'on') return true;
		if (raw === 'off') return false;
		return null;
	} catch {
		return null;
	}
}

export function writeDownloadPreference(on: boolean): void {
	try {
		localStorage.setItem(DOWNLOAD_PREFERENCE_KEY, on ? 'on' : 'off');
	} catch {
		// Storage unavailable: the choice lasts until reload.
	}
}

export function browserSavesData(): boolean {
	if (typeof navigator === 'undefined') return false;
	return (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;
}

/** An explicit choice wins; without one the browser's data saver flag limits the download. */
export function downloadMode(preference: boolean | null, savesData: boolean): DownloadMode {
	if (preference === false) return 'off';
	if (preference === true) return 'full';
	return savesData ? 'catchUp' : 'full';
}
