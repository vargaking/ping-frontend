/** Apple's push service revokes a subscription whose pushes don't each show a notification. */
export function isApplePushEndpoint(endpoint: string): boolean {
	try {
		const { hostname } = new URL(endpoint);
		return hostname === 'push.apple.com' || hostname.endsWith('.push.apple.com');
	} catch {
		return false;
	}
}
