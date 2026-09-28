import type { JSONContent } from '@tiptap/core';

/** `content` is typed as JSONContent, but stored rows and DM previews can still
 *  carry it as a JSON string (or a legacy plain string). */
export function parseMessageContent(raw: unknown): JSONContent | string {
	if (typeof raw !== 'string') return raw as JSONContent;
	try {
		return JSON.parse(raw);
	} catch {
		try {
			// Fallback for Python-style stringified dicts (single quotes / None).
			const fixed = raw
				.replace(/'/g, '"')
				.replace(/False/g, 'false')
				.replace(/True/g, 'true')
				.replace(/None/g, 'null');
			return JSON.parse(fixed);
		} catch {
			return raw; // legacy plain-string message
		}
	}
}

/** Flatten message content to a single line of plain text, for list previews. */
export function messagePlainText(raw: unknown): string {
	const parsed = parseMessageContent(raw);
	if (typeof parsed !== 'object' || parsed === null) return String(raw ?? '');

	const parts: string[] = [];
	const walk = (node: JSONContent) => {
		if (node.type === 'text') parts.push(node.text ?? '');
		else if (node.type === 'mention') parts.push(`@${node.attrs?.label ?? node.attrs?.id ?? ''}`);
		else if (node.type === 'hardBreak') parts.push(' ');
		node.content?.forEach(walk);
		// Separate block nodes (paragraphs, list items) with a space.
		if (node.content && node.type !== 'doc') parts.push(' ');
	};
	walk(parsed);
	return parts.join('').replace(/\s+/g, ' ').trim();
}

/** Whether a message's content mentions the given user (client-side only — the
 *  server doesn't count mentions since stored content isn't normalised yet). */
export function messageMentionsUser(raw: unknown, userId: number): boolean {
	const parsed = parseMessageContent(raw);
	if (typeof parsed !== 'object' || parsed === null) return false;

	const target = String(userId);
	let found = false;
	const walk = (node: JSONContent) => {
		if (found) return;
		if (node.type === 'mention' && String(node.attrs?.id) === target) {
			found = true;
			return;
		}
		node.content?.forEach(walk);
	};
	walk(parsed);
	return found;
}

/** Parse an API timestamp to ms. Offset-less strings are UTC. */
export function timestampMs(ts: string): number {
	return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`);
}
