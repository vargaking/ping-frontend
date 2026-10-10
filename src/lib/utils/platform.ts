export function isApple(): boolean {
	if (typeof navigator === 'undefined') return false;
	const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
	const platform = nav.userAgentData?.platform ?? nav.platform ?? navigator.userAgent;
	return /Mac|iPhone|iPad|iPod/i.test(platform);
}
