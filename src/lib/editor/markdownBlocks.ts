import type { JSONContent } from '@tiptap/core';

/** Reads one block starting at lines[start]; null when that line doesn't start one. */
export type BlockRule = (
	lines: string[],
	start: number
) => { node: JSONContent; next: number } | null;

/** Language token after a fence, as the server's import reads it. */
export const FENCE_LANGUAGE = /^([\w+#.-]+)\s*$/;

const FENCE = '```';

// Mirrors the server's markdown import, so a pasted fence and an imported one match.
export const fencedCode: BlockRule = (lines, start) => {
	if (!lines[start].startsWith(FENCE)) return null;

	const first = lines[start].slice(FENCE.length);
	const body: string[] = [];
	let language = '';
	let next = start + 1;

	if (first.trimEnd().endsWith(FENCE) && first.trim().length >= FENCE.length) {
		body.push(first.trimEnd().slice(0, -FENCE.length));
	} else {
		const match = FENCE_LANGUAGE.exec(first);
		if (match) language = match[1];
		else if (first) body.push(first);

		while (next < lines.length) {
			const line = lines[next++];
			if (line.trimEnd().endsWith(FENCE)) {
				const tail = line.trimEnd().slice(0, -FENCE.length);
				if (tail) body.push(tail);
				break;
			}
			body.push(line);
		}
	}

	const text = body.join('\n');
	const node: JSONContent = { type: 'codeBlock', attrs: { language: language || null } };
	if (text) node.content = [{ type: 'text', text }];
	return { node, next };
};

const paragraph = (text: string): JSONContent => ({
	type: 'paragraph',
	content: [{ type: 'text', text }]
});

const HORIZONTAL_RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(\S.*?)[ \t]*$/;
const QUOTE = /^ {0,3}>(?:[ \t](.*))?$/;
const LIST_ITEM = /^([ \t]*)(?:([-*+])|(\d{1,9})[.)])[ \t]+(\S.*?)[ \t]*$/;
const TASK_ITEM = /^\[[ xX]\](?:\s|$)/;
const TAB_WIDTH = 4;
const MAX_START_INDENT = 3;

export const horizontalRule: BlockRule = (lines, start) =>
	HORIZONTAL_RULE.test(lines[start]) ? { node: { type: 'horizontalRule' }, next: start + 1 } : null;

export const heading: BlockRule = (lines, start) => {
	const match = HEADING.exec(lines[start]);
	if (!match) return null;
	return {
		node: {
			type: 'heading',
			attrs: { level: match[1].length },
			content: [{ type: 'text', text: match[2] }]
		},
		next: start + 1
	};
};

export const blockquote: BlockRule = (lines, start) => {
	const content: JSONContent[] = [];
	let next = start;
	for (; next < lines.length; next++) {
		const match = QUOTE.exec(lines[next]);
		if (!match) break;
		const text = (match[1] ?? '').trim();
		if (text) content.push(paragraph(text));
	}
	return content.length ? { node: { type: 'blockquote', content }, next } : null;
};

type ListItem = { indent: number; ordered: boolean; number: number; text: string };

function readListItem(line: string): ListItem | null {
	const match = LIST_ITEM.exec(line);
	if (!match || TASK_ITEM.test(match[4])) return null;
	let indent = 0;
	for (const char of match[1]) indent += char === '\t' ? TAB_WIDTH : 1;
	return { indent, ordered: match[3] !== undefined, number: Number(match[3] ?? 0), text: match[4] };
}

function listNode(items: ListItem[]): JSONContent {
	let at = 0;

	const read = (): JSONContent => {
		const head = items[at];
		const entries: JSONContent[] = [];
		const list: JSONContent = {
			type: head.ordered ? 'orderedList' : 'bulletList',
			content: entries
		};
		if (head.ordered && head.number !== 1) list.attrs = { start: head.number };

		while (at < items.length) {
			const item = items[at];
			if (item.indent < head.indent) break;
			if (item.indent > head.indent) {
				entries[entries.length - 1].content!.push(read());
				continue;
			}
			if (item.ordered !== head.ordered) break;
			entries.push({ type: 'listItem', content: [paragraph(item.text)] });
			at++;
		}
		return list;
	};

	return read();
}

export const list: BlockRule = (lines, start) => {
	const first = readListItem(lines[start]);
	if (!first || first.indent > MAX_START_INDENT) return null;

	const items = [first];
	let next = start + 1;
	for (let i = start + 1; i < lines.length; i++) {
		if (!lines[i].trim()) continue;
		const item = readListItem(lines[i]);
		if (!item || item.indent < first.indent) break;
		if (item.indent === first.indent && item.ordered !== first.ordered) break;
		items.push(item);
		next = i + 1;
	}
	return { node: listNode(items), next };
};

/**
 * In order; the first rule that reads a block wins. Lines no rule claims become paragraphs.
 * Only nodes the server accepts: tables, images, task lists and HTML stay as text.
 */
export const blockRules: BlockRule[] = [fencedCode, horizontalRule, heading, blockquote, list];

/** The blocks of a pasted text, or null when no rule matched (the editor's own paste is used then). */
export function markdownToBlocks(
	text: string,
	rules: BlockRule[] = blockRules
): JSONContent[] | null {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const blocks: JSONContent[] = [];
	let matched = false;

	for (let i = 0; i < lines.length; ) {
		let read: ReturnType<BlockRule> = null;
		for (const rule of rules) {
			read = rule(lines, i);
			if (read) break;
		}
		if (read) {
			blocks.push(read.node);
			i = read.next;
			matched = true;
			continue;
		}
		if (lines[i]) blocks.push(paragraph(lines[i]));
		i++;
	}

	return matched ? blocks : null;
}

/** What an opening fence line (typed, then Enter) asks for; null when the line isn't one. */
export function fenceOpening(lineText: string): { language: string | null } | null {
	if (!lineText.startsWith(FENCE)) return null;
	const rest = lineText.slice(FENCE.length).trim();
	if (!rest) return { language: null };
	const match = FENCE_LANGUAGE.exec(rest);
	return match ? { language: match[1] } : null;
}
