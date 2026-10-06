const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 3;

type Dismissal = { dismissedAt: number; count: number };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Remembers that a corner prompt was dismissed: snoozed for a week each time,
 *  then for good after the third dismissal. */
export function createDismissal(key: string, storage?: StorageLike) {
	function read(): Dismissal | null {
		try {
			const raw = (storage ?? localStorage).getItem(key);
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			if (typeof parsed?.dismissedAt !== 'number' || typeof parsed?.count !== 'number') return null;
			return parsed;
		} catch {
			return null;
		}
	}

	return {
		isSnoozed(now = Date.now()): boolean {
			const dismissal = read();
			if (!dismissal) return false;
			return dismissal.count >= MAX_DISMISSALS || now - dismissal.dismissedAt < SNOOZE_MS;
		},

		dismiss(now = Date.now()) {
			const count = (read()?.count ?? 0) + 1;
			try {
				(storage ?? localStorage).setItem(key, JSON.stringify({ dismissedAt: now, count }));
			} catch {
				// Storage unavailable: the prompt will simply come back next load.
			}
		}
	};
}
