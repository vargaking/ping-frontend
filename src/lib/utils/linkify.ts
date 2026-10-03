export type Segment = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

const CANDIDATE = /(?<![\w@/.-])(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', "'", '"', '*', '_', '~']);
const BRACKET_PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function count(text: string, char: string): number {
	return text.split(char).length - 1;
}

function trimTail(candidate: string): string {
	let end = candidate.length;
	while (end > 0) {
		const last = candidate[end - 1];
		const opener = BRACKET_PAIRS[last];
		const head = candidate.slice(0, end);
		if (TRAILING_PUNCTUATION.has(last) || (opener && count(head, last) > count(head, opener))) {
			end--;
		} else {
			break;
		}
	}
	return candidate.slice(0, end);
}

/** Returns a normalised http(s) URL, or null for anything else. */
export function safeHref(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
	return url.href;
}

function pushText(segments: Segment[], text: string) {
	if (!text) return;
	const last = segments[segments.length - 1];
	if (last?.kind === 'text') last.text += text;
	else segments.push({ kind: 'text', text });
}

export function linkify(text: string): Segment[] {
	const segments: Segment[] = [];
	let cursor = 0;

	for (const match of text.matchAll(CANDIDATE)) {
		const start = match.index;
		const candidate = trimTail(match[0]);
		const href = /^www\./i.test(candidate) ? `https://${candidate}` : candidate;
		if (!safeHref(href)) continue;

		pushText(segments, text.slice(cursor, start));
		segments.push({ kind: 'link', text: candidate, href });
		cursor = start + candidate.length;
	}

	pushText(segments, text.slice(cursor));
	return segments;
}

/** The first link `linkify` would make in `text`, as an absolute URL. */
export function firstLinkHref(text: string): string | null {
	const first = linkify(text).find((segment) => segment.kind === 'link');
	return first?.kind === 'link' ? first.href : null;
}
