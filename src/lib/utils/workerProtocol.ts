/** Page → waiting worker: take over now. */
export const SKIP_WAITING = 'skip-waiting';
/** Page → worker, with a MessagePort: reply with `{ version }`. */
export const VERSION_QUERY = 'version';

/** Hashed build files: a path always has the same content, whichever build cached it. */
export const IMMUTABLE_PREFIX = '/_app/immutable/';

/** How many older builds' caches stay while other windows may still run them. */
export const KEPT_SHELL_CACHES = 2;

/**
 * The shell caches to delete when `current` activates. `keys` is in creation order
 * (CacheStorage.keys() guarantees it). With other windows open, the newest older caches stay
 * so tabs still on those builds can load their own chunks.
 */
export function staleShellCaches(
	keys: readonly string[],
	current: string,
	openWindows: number
): string[] {
	const older = keys.filter((key) => key.startsWith('shell-') && key !== current);
	if (openWindows <= 1) return older;
	return older.slice(0, Math.max(0, older.length - KEPT_SHELL_CACHES));
}
