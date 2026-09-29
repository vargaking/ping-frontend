const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITE_LINK = /^(?:[a-z][a-z0-9+.-]*:\/\/)?[^/\s]+\/invite\/([^/?#\s]+)\/?(?:[?#]\S*)?$/i;

/** The invite code in a pasted invite link (any origin) or bare code, or null if it isn't one. */
export function parseInviteCode(input: string): string | null {
	const text = input.trim();
	const code = INVITE_LINK.exec(text)?.[1] ?? text;
	return UUID.test(code) ? code.toLowerCase() : null;
}
