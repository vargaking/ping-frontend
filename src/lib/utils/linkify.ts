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

// File extensions such as js, json, md, ts and py are deliberately missing, so names like
// Node.js or package.json are not read as addresses.
const TLDS = [
	'com,net,org,io,co,app,dev,gg,xyz,info,biz,me,tv,ai,us,uk,de,fr,nl,hu,eu,ru,cn,jp,br,in,au,ca',
	'es,it,pl,ch,se,no,fi,cz,sk,at,be,dk,pt,gr,ro,tr,ua,kr,tw,hk,sg,nz,za,mx,ar,cl,online,site',
	'store,shop,top,live,link,click,cc,ws,to,ly'
].join(',');
const DOMAIN_TEXT = new RegExp(
	String.raw`^(?:[\p{L}\p{N}-]+\.)+(?:${TLDS.replaceAll(',', '|')}|xn--[a-z0-9-]+)(?::\d+)?(?:[/?#]\S*)?$`,
	'iu'
);

const INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
const LEADING_SPACE = /^\s+/;
const TRAILING_JUNK = /[\s.,;:!?]+$/;

function hostOf(address: string): string | null {
	try {
		const url = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`);
		return url.hostname.replace(/^www\./, '').replace(/\.$/, '');
	} catch {
		return null;
	}
}

/**
 * What to show for a link. Text that reads as an address of its own is only kept when it
 * points at the same host as the link; otherwise the real target is shown instead.
 */
export function linkLabel(text: string, href: string): string {
	const shown = text.replace(INVISIBLE, '').replace(LEADING_SPACE, '').replace(TRAILING_JUNK, '');
	if (!URL_TEXT.test(shown) && !DOMAIN_TEXT.test(shown)) return text;

	const shownHost = hostOf(shown);
	return shownHost !== null && shownHost === hostOf(href) ? text : href;
}

type InlineNode = { type?: string; text?: string; marks?: { type: string; attrs?: unknown }[] };

export type InlineRun<T extends InlineNode> = { nodes: T[]; text: string; href: string | null };

/** Consecutive text nodes that link to the same address form one run, so the link is judged as a whole. */
export function linkRuns<T extends InlineNode>(children: T[]): InlineRun<T>[] {
	const runs: InlineRun<T>[] = [];
	for (const node of children) {
		const mark = node.type === 'text' ? node.marks?.find((m) => m.type === 'link') : undefined;
		const href = mark ? safeHref((mark.attrs as { href?: unknown } | undefined)?.href) : null;
		const last = runs[runs.length - 1];
		if (href && last?.href === href) {
			last.nodes.push(node);
			last.text += node.text ?? '';
		} else {
			runs.push({ nodes: [node], text: node.text ?? '', href });
		}
	}
	return runs;
}
