export function shouldCheck(now: number, lastCheckAt: number | null, minGapMs: number): boolean {
	return lastCheckAt == null || now - lastCheckAt >= minGapMs;
}

/** What reloading would cost the user right now, or null when nothing. */
export function updateNoticeDetail(input: {
	offline: boolean;
	inCall: boolean;
	unsentAttachments: boolean;
}): string | null {
	if (input.offline) return "You're offline. Reload once you're back online.";
	if (input.inCall && input.unsentAttachments) {
		return "Reloading will drop your voice call and the attachments you haven't sent.";
	}
	if (input.inCall) return 'Reloading will drop your voice call.';
	if (input.unsentAttachments) return "Attachments you haven't sent will be lost.";
	return null;
}
