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

const URL_TEXT = /^https?:\/\/\S+$/i;
const DOMAIN_TEXT = /^(?:[\p{L}\p{N}-]+\.)+(?:\p{L}{2,}|xn--[a-z0-9-]+)(?::\d+)?(?:[/?#]\S*)?$/iu;

function hostOf(address: string): string | null {
	try {
		const url = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`);
		return url.hostname.replace(/^www\./, '');
	} catch {
		return null;
	}
}

/**
 * What to show for a link. Text that reads as an address of its own is only kept when it
 * points at the same host as the link; otherwise the real target is shown instead.
 */
export function linkLabel(text: string, href: string): string {
	const shown = text.trim();
	if (!URL_TEXT.test(shown) && !DOMAIN_TEXT.test(shown)) return text;

	const shownHost = hostOf(shown);
	return shownHost !== null && shownHost === hostOf(href) ? text : href;
}
