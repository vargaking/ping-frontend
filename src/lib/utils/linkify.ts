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
	url.username = '';
	url.password = '';
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

const URL_TEXT = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
const SCHEME_PREFIX = /^(?:(https?):\/*|([a-z][a-z0-9+.-]*):\/{1,2})(?=[^\s/])/i;

// Common file extensions that are not commonly abused as domains, so names like Node.js or
// package.json are not read as addresses.
const FILE_EXTENSIONS = new Set(
	'js ts json md py sh rs txt yml yaml toml lock css html svelte jsx tsx cjs mjs ini cfg log csv'.split(
		' '
	)
);
const DOMAIN_TEXT = /^(?:[\p{L}\p{N}_-]+\.)+(\p{L}{2,}|xn--[a-z0-9-]+)((?::\d+)?(?:[/?#]\S*)?)$/iu;

const DOT_LOOKALIKES = /[\u2024\u3002\uff0e\uff61]/g;
const HIDDEN = /[\p{Cf}\p{Default_Ignorable_Code_Point}\p{M}\u2800]/gu;
const EDGE =
	/^[\p{P}\p{S}\p{Z}\p{M}\p{Cf}\p{Cc}\u2800]+|[\p{P}\p{S}\p{Z}\p{M}\p{Cf}\p{Cc}\u2800]+$/gu;

/** Link text as a reader would see it, without wrapping punctuation, blanks or lookalike dots. */
function plainText(text: string): string {
	return text
		.normalize('NFKC')
		.replace(DOT_LOOKALIKES, '.')
		.replace(HIDDEN, '')
		.replaceAll('\\', '/')
		.replace(EDGE, '')
		.replace(SCHEME_PREFIX, (_, web, other) => `${web ?? other}://`);
}

function looksLikeAddress(shown: string): boolean {
	if (URL_TEXT.test(shown)) return true;
	const match = DOMAIN_TEXT.exec(shown);
	if (!match) return false;
	const bare = match[2] === '';
	return !(bare && FILE_EXTENSIONS.has(match[1].toLowerCase()));
}

function hostOf(address: string): string | null {
	try {
		const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(address) ? address : `https://${address}`);
		return url.hostname.replace(/^www\./, '').replace(/\.$/, '');
	} catch {
		return null;
	}
}

/** Whether `text` reads as an address whose host is not the host of every one of `hrefs`. */
export function isMasked(text: string, hrefs: string[]): boolean {
	const shown = plainText(text);
	if (!looksLikeAddress(shown)) return false;

	const shownHost = hostOf(shown);
	return shownHost === null || hrefs.some((href) => hostOf(href) !== shownHost);
}

/**
 * What to show for a link. Text that reads as an address of its own is only kept when it
 * points at the same host as the link; otherwise the real target is shown instead.
 */
export function linkLabel(text: string, href: string): string {
	return isMasked(text, [href]) ? href : text;
}

type Mark = { type: string; attrs?: unknown };
type InlineNode = { type?: string; text?: string; marks?: Mark[] };

/** A text node can carry several link marks; only the first one counts. */
export function effectiveMarks<M extends { type: string }>(marks: M[] | undefined): M[] {
	if (!Array.isArray(marks)) return [];
	const first = marks.findIndex((mark) => mark?.type === 'link');
	return marks.filter((mark, i) => mark?.type !== 'link' || i === first);
}

export type InlineRun<T extends InlineNode> = {
	nodes: T[];
	text: string;
	/** The safe target of each node in `nodes`; empty for a run that is not a link. */
	hrefs: string[];
};

function textOf(node: InlineNode): string {
	return typeof node?.text === 'string' ? node.text : '';
}

/** Consecutive linked text nodes form one run, so the link text is judged as a whole. */
export function linkRuns<T extends InlineNode>(children: T[]): InlineRun<T>[] {
	const runs: InlineRun<T>[] = [];
	for (const node of children) {
		const mark =
			node?.type === 'text' ? effectiveMarks(node.marks).find((m) => m.type === 'link') : undefined;
		const href = mark ? safeHref((mark.attrs as { href?: unknown } | undefined)?.href) : null;
		const last = runs[runs.length - 1];
		if (!href) {
			runs.push({ nodes: [node], text: textOf(node), hrefs: [] });
		} else if (last && last.hrefs.length > 0) {
			last.nodes.push(node);
			last.hrefs.push(href);
			last.text += textOf(node);
		} else {
			runs.push({ nodes: [node], text: textOf(node), hrefs: [href] });
		}
	}
	return runs;
}

/**
 * The real targets to show in place of a masked run, one per stretch of the same link, or null
 * when the run can be shown as written. Each stretch is judged on its own as well as the whole run.
 */
export function maskedTargets<T extends InlineNode>(run: InlineRun<T>): string[] | null {
	if (run.hrefs.length === 0) return null;

	const stretches: { href: string; text: string }[] = [];
	run.nodes.forEach((node, i) => {
		const last = stretches[stretches.length - 1];
		if (last?.href === run.hrefs[i]) last.text += textOf(node);
		else stretches.push({ href: run.hrefs[i], text: textOf(node) });
	});

	const targets = stretches.map((stretch) => stretch.href);
	const masked =
		isMasked(run.text, targets) ||
		stretches.some((stretch) => isMasked(stretch.text, [stretch.href]));
	return masked ? targets : null;
}
