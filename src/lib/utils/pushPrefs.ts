const CACHE_NAME = 'zeta-prefs';
const PREFS_URL = '/__prefs';

export type PushPrefs = { sound: boolean };

const DEFAULT_PREFS: PushPrefs = { sound: true };

/** The service worker can't read localStorage, so the page mirrors the prefs
 *  it needs into Cache Storage, which both sides can reach. */
export async function writePushPrefs(prefs: PushPrefs): Promise<void> {
	try {
		const cache = await caches.open(CACHE_NAME);
		await cache.put(PREFS_URL, new Response(JSON.stringify(prefs)));
	} catch {
		// Cache Storage unavailable: pushes fall back to the default prefs.
	}
}

export async function readPushPrefs(): Promise<PushPrefs> {
	try {
		const cache = await caches.open(CACHE_NAME);
		const response = await cache.match(PREFS_URL);
		if (!response) return DEFAULT_PREFS;
		const data = await response.json();
		return { sound: data?.sound !== false };
	} catch {
		return DEFAULT_PREFS;
	}
}
