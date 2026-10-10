/** Page → waiting worker: take over now. */
export const SKIP_WAITING = 'skip-waiting';
/** Page → worker, with a MessagePort: reply with `{ version }`. */
export const VERSION_QUERY = 'version';

/** Hashed build files: a path always has the same content, whichever build cached it. */
export const IMMUTABLE_PREFIX = '/_app/immutable/';

/** How many older builds' caches stay while other windows may still run them. */
export const KEPT_SHELL_CACHES = 2;

/** Held in a shell cache from install until its worker activates. */
export const INSTALLING_MARKER = '/__installing';

export type ShellCache = { key: string; activated: boolean };

/**
 * The shell caches to delete when `current` activates. `caches` is in creation order
 * (CacheStorage.keys() guarantees it). A cache whose worker never activated was never run by
 * any tab, so it goes. Of the rest, with other windows open the newest older ones stay, so
 * tabs still on those builds can load their own chunks.
 */
export function staleShellCaches(
	caches: readonly ShellCache[],
	current: string,
	openWindows: number
): string[] {
	const shell = caches.filter(({ key }) => key.startsWith('shell-'));
	const currentAt = shell.findIndex(({ key }) => key === current);
	// A cache newer than the current one belongs to a worker still installing or waiting.
	const never = shell.filter(({ activated }, i) => !activated && (currentAt < 0 || i < currentAt));
	const ran = shell.filter(({ key, activated }) => activated && key !== current);
	const kept = openWindows <= 1 ? 0 : KEPT_SHELL_CACHES;
	const dropped = new Set(
		[...never, ...ran.slice(0, Math.max(0, ran.length - kept))].map(({ key }) => key)
	);
	return shell.filter(({ key }) => dropped.has(key)).map(({ key }) => key);
}
