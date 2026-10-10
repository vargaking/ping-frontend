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

/** In order; the first rule that reads a block wins. Lines no rule claims become paragraphs. */
export const blockRules: BlockRule[] = [fencedCode];

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
		if (lines[i]) blocks.push({ type: 'paragraph', content: [{ type: 'text', text: lines[i] }] });
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
