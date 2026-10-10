import type { JSONContent } from '@tiptap/core';

const isEmptyParagraph = (node: JSONContent) =>
	node.type === 'paragraph' && (node.content ?? []).every((child) => child.type === 'hardBreak');

/** The document without empty paragraphs at its end, such as the one the editor keeps after a code block. */
export function withoutTrailingEmptyParagraphs(doc: JSONContent): JSONContent {
	const content = doc.content;
	if (!content) return doc;

	let end = content.length;
	while (end > 1 && isEmptyParagraph(content[end - 1])) end--;
	return end === content.length ? doc : { ...doc, content: content.slice(0, end) };
}
