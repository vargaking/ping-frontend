const KEY = 'notifications:pushPrompt';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 3;

type Dismissal = { dismissedAt: number; count: number };

function read(): Dismissal | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (typeof parsed?.dismissedAt !== 'number' || typeof parsed?.count !== 'number') return null;
		return parsed;
	} catch {
		return null;
	}
}

/** True when "Not now" was chosen recently, or was chosen enough times that the
 *  prompt should now live only in Settings. */
export function isPushPromptSnoozed(now = Date.now()): boolean {
	const dismissal = read();
	if (!dismissal) return false;
	return dismissal.count >= MAX_DISMISSALS || now - dismissal.dismissedAt < SNOOZE_MS;
}

export function dismissPushPrompt(now = Date.now()) {
	const count = (read()?.count ?? 0) + 1;
	try {
		localStorage.setItem(KEY, JSON.stringify({ dismissedAt: now, count }));
	} catch {
		// Storage unavailable: the prompt will simply come back next load.
	}
}
