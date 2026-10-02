import type { InviteResponse } from '$lib/types/invite.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITE_LINK = /^(?:[a-z][a-z0-9+.-]*:\/\/)?[^/\s]+\/invite\/([^/?#\s]+)\/?(?:[?#]\S*)?$/i;

/** The invite code in a pasted invite link (any origin) or bare code, or null if it isn't one. */
export function parseInviteCode(input: string): string | null {
	const text = input.trim();
	const code = INVITE_LINK.exec(text)?.[1] ?? text;
	return UUID.test(code) ? code.toLowerCase() : null;
}

/** The shareable landing-page link for an invite code. */
export function inviteLink(code: string): string {
	return `${window.location.origin}/invite/${code}/`;
}

/** Whether an invite can still be used to join: not revoked, not expired, not used up. */
export function isInviteActive(invite: InviteResponse): boolean {
	if (!invite.is_active) return false;
	if (invite.valid_until && new Date(invite.valid_until).getTime() <= Date.now()) return false;
	return invite.max_uses === null || invite.use_count < invite.max_uses;
}
