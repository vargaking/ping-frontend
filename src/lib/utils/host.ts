/** Host a URL points at. An empty or relative URL means same-origin, so fall back to the page host. */
export function hostOf(url: string): string {
	const fallback = typeof window !== 'undefined' ? window.location.host : '';
	if (!url) return fallback;
	try {
		return new URL(url, typeof window !== 'undefined' ? window.location.origin : undefined).host;
	} catch {
		return url;
	}
}
