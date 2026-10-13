import type { JSONContent } from '@tiptap/core';
import { parseInviteCode } from '$lib/utils/inviteCode';
import { effectiveMarks, linkify, safeHref } from '$lib/utils/linkify';
import { parseMessageContent } from '$lib/utils/messageContent';

const INVITE_PATH = /^\/invite\/([^/]+)\/?$/i;

/** The invite code if `href` is an invite link on this app's own origin, otherwise null. */
export function ownInviteCode(href: unknown, origin: string): string | null {
	const safe = safeHref(href);
	if (safe === null) return null;
	const url = new URL(safe);
	if (url.origin !== origin) return null;
	const code = INVITE_PATH.exec(url.pathname)?.[1];
	return code ? parseInviteCode(code) : null;
}

function inviteCodeIn(node: JSONContent, origin: string): string | null {
	if (node.type === 'codeBlock') return null;
	if (node.type === 'text') {
		const marks = effectiveMarks(node.marks);
		const link = marks.find((mark) => mark.type === 'link');
		if (link) return ownInviteCode(link.attrs?.href, origin);
		if (marks.some((mark) => mark.type === 'code')) return null;
		return inviteCodeInText(node.text ?? '', origin);
	}
	for (const child of node.content ?? []) {
		const code = inviteCodeIn(child, origin);
		if (code) return code;
	}
	return null;
}

function inviteCodeInText(text: string, origin: string): string | null {
	for (const segment of linkify(text)) {
		if (segment.kind !== 'link') continue;
		const code = ownInviteCode(segment.href, origin);
		if (code) return code;
	}
	return null;
}

/** The code of the first own-origin invite link MessageNode would render in the message. */
export function findInviteCode(raw: unknown, origin: string): string | null {
	const parsed = parseMessageContent(raw);
	if (typeof parsed === 'string') return inviteCodeInText(parsed, origin);
	if (typeof parsed !== 'object' || parsed === null) return null;
	return inviteCodeIn(parsed, origin);
}
